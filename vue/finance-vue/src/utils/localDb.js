import FinanceProvider from "@/utils/FinanceProvider.js";

class IndexedDBFinanceProvider extends FinanceProvider {
    constructor() {
        super();
        this.dbName = "qb.financeDatabase";
        this.dbVersion = 1;
        this.db = null;
        this.isInitialized = false;

        this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isInitialized = true;
                console.info("IndexedDB connected successfully");
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object stores (similar to tables)
                if (!db.objectStoreNames.contains("transactions")) {
                    const transactionStore = db.createObjectStore("transactions", { keyPath: "id", autoIncrement: true });
                    transactionStore.createIndex("date", "date", { unique: false });
                    transactionStore.createIndex("account", "account", { unique: false });
                    transactionStore.createIndex("amount", "amount", { unique: false });
                    transactionStore.createIndex("dateAccount", ["date", "account"], { unique: false });
                }

                if (!db.objectStoreNames.contains("vendorCategories")) {
                    const categoryStore = db.createObjectStore("vendorCategories", { keyPath: "id", autoIncrement: true });
                    categoryStore.createIndex("vendor", "vendor", { unique: true });
                }
            };
        });
    }

    async ensureInitialized() {
        if (!this.isInitialized) {
            await this.init();
        }
    }

    async getPosCategories() {
        await this.ensureInitialized();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["vendorCategories"], "readonly");
            const store = transaction.objectStore("vendorCategories");
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getTransactionsSinceMonthsAgo(monthsAgo) {
        await this.ensureInitialized();

        const dateNMonthsAgo = new Date();
        dateNMonthsAgo.setMonth(dateNMonthsAgo.getMonth() - monthsAgo);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["transactions"], "readonly");
            const store = transaction.objectStore("transactions");
            const index = store.index("date");
            const range = IDBKeyRange.lowerBound(dateNMonthsAgo.toISOString());
            const request = index.getAll(range);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async insertCategory(category) {
        await this.ensureInitialized();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["vendorCategories"], "readwrite");
            const store = transaction.objectStore("vendorCategories");
            const categoryToInsert = category.value || category;
            const request = store.add(categoryToInsert);

            request.onsuccess = () => resolve({
                insertId: request.result,
                success: true
            });
            request.onerror = () => reject(request.error);
        });
    }

    async addVendor(vendorData) {
        await this.ensureInitialized();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["vendorCategories"], "readwrite");
            const store = transaction.objectStore("vendorCategories");
            const request = store.add(vendorData);

            request.onsuccess = () => resolve({
                insertId: request.result,
                success: true
            });
            request.onerror = () => reject(request.error);
        })
    }

    async importTransactions(transactionsToImport) {
        await this.ensureInitialized();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["transactions"], "readwrite");
            const store = tx.objectStore("transactions");

            let successCount = 0;

            transactionsToImport.transactions.forEach(transaction => {
                // Dunno why, but we need to parse to JSON and back here?
                transaction = JSON.parse(JSON.stringify(transaction));
                transaction = this.transactionToExternalModel(transaction);

                const request = store.add(transaction);

                // As we import transactions, let's also create vendors with category mappings.
                const newCategory = {
                  vendor: transaction.vendor,
                  category: transaction.categoryOverride,
                  regexMaybe: ""
                }

                this.addVendor(newCategory);

                request.onsuccess = () => { successCount++; };
            });

            tx.oncomplete = () => resolve({
                success: true,
                count: successCount
            });
            tx.onerror = () => reject(tx.error);
        });
    }

    async getTransactions(transactionQuery) {
        await this.ensureInitialized();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["transactions"], "readonly");
            const store = transaction.objectStore("transactions");
            const request = store.getAll();

            request.onsuccess = () => {
                let results = request.result;

                // Filter based on query parameters
                if (transactionQuery) {
                    const cleanQuery = this.fixOptionalTransaction(
                        transactionQuery.value || transactionQuery
                    );

                    results = results.filter(tx => {
                        for (const key in cleanQuery) {
                            if (cleanQuery[key] !== null &&
                                cleanQuery[key] !== undefined &&
                                tx[key] !== cleanQuery[key]) {
                                return false;
                            }
                        }
                        return true;
                    });
                }

                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getTransactionMatching(amount, account) {
        await this.ensureInitialized();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["transactions"], "readonly");
            const store = transaction.objectStore("transactions");
            const request = store.getAll();

            request.onsuccess = () => {
                const matches = request.result.filter(tx =>
                    Math.abs(tx.amount - amount) < 0.001 && tx.account === account
                );
                resolve(matches.length > 0 ? matches[0] : null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getVendorOverrides() {
        await this.ensureInitialized();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["vendorCategories"], "readonly");
            const store = transaction.objectStore("vendorCategories");
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteVendor(vendorIdToDelete) {
        await this.ensureInitialized();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["vendorCategories"], "readwrite");
            const store = transaction.objectStore("vendorCategories");
            const request = store.delete(vendorIdToDelete);

            request.onsuccess = () => resolve({
                success: true
            });
            request.onerror = () => reject(request.error);
        });
    }

    async updateTransaction(id, updateData) {
        await this.ensureInitialized();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["transactions"], "readwrite");
            const store = transaction.objectStore("transactions");

            // First get the existing transaction
            const getRequest = store.get(id);

            getRequest.onsuccess = () => {
                const existingTransaction = getRequest.result;
                if (!existingTransaction) {
                    reject(new Error(`Transaction with id ${id} not found`));
                    return;
                }

                // Update with new data
                const cleanUpdate = this.fixOptionalTransaction(updateData);
                const updatedTransaction = {...existingTransaction, ...cleanUpdate};

                // Put back the updated transaction
                const putRequest = store.put(updatedTransaction);

                putRequest.onsuccess = () => resolve({
                    success: true,
                    id: id
                });
                putRequest.onerror = () => reject(putRequest.error);
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async updateCategory(categoryData) {
        await this.ensureInitialized();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["vendorCategories"], "readwrite");
            const store = transaction.objectStore("vendorCategories");
            const request = store.put(categoryData);

            request.onsuccess = () => resolve({
                success: true
            });
            request.onerror = () => reject(request.error);
        });
    }

    transactionToExternalModel(transaction) {
        if (transaction.category === undefined || transaction.category === "" ) {
            transaction.category = "Unknown";
        }

        return {
            date: transaction.date,
            account: transaction.account,
            amount: transaction.amount,
            vendor: transaction.vendor,
            categoryOverride: transaction.category,
            purchaseType: transaction.type,
            location: transaction.location,
        };
    }

    vendorToExternalModel(vendor) {
        if (vendor.category === undefined || transaction.category === "" ) {
            vendor.category = "Unknown";
        }

        return {
            vendor: vendor.vendor,
            categoryName: vendor.category,
            regexMaybe: vendor.regexMaybe
        };
    }
}

// Export a singleton instance
const localDb = new IndexedDBFinanceProvider();
export default localDb;