// api.js
import axios from "axios";
import FinanceProvider from "@/utils/FinanceProvider.js";

// Implementation for server-side API calls
class ServerFinanceProvider extends FinanceProvider {
    constructor() {
        super();
        this.baseUrl = 'http://localhost:9000';
    }

    async getPosCategories() {
        const response = await axios.get(`${this.baseUrl}/vendor-categories`);
        return response.data.vendorCategories;
    }

    async getTransactionsSinceMonthsAgo(monthsAgo) {
        const response = await axios.get(`${this.baseUrl}/transactions?monthsAgo=${monthsAgo}`);
        return response.data.transactions;
    }

    async insertCategory(newCategory) {
        return axios.post(
            `${this.baseUrl}/add-vendor`,
            JSON.stringify(newCategory.value || newCategory),
            {headers: {'Content-Type': 'application/json'}}
        );
    }

    /**
     * Imports transactions only.
     *
     * This used to also POST /add-vendor once per transaction, which is how a
     * single 140-row month created 140 vendor rules - 527 of the 1,000 rules in
     * the database can never fire because of it. Creating rules is now an
     * explicit, de-duplicated step the import page performs (and shows) itself.
     */
    async importTransactions(transactionsToImport) {
        return axios.post(
            `${this.baseUrl}/import-transactions`,
            JSON.stringify(transactionsToImport),
            {headers: {'Content-Type': 'application/json'}}
        );
    }

    async getTransactions(transactionQuery) {
        const cleanQuery = this.fixOptionalTransaction(transactionQuery);
        const response = await axios.post(
            `${this.baseUrl}/get-transactions`,
            cleanQuery.value || cleanQuery
        );
        return response.data.transactions;
    }

    async getVendorOverrides() {
        const response = await axios.get(`${this.baseUrl}/vendor-categories`);
        return response.data.vendorCategories;
    }

    async deleteVendor(vendorIdToDelete) {
        return axios.delete(`${this.baseUrl}/delete-vendor?id=${vendorIdToDelete}`);
    }

    async updateTransaction(id, updateData) {
        const cleanUpdate = this.fixOptionalTransaction(updateData);
        return axios.post(
            `${this.baseUrl}/update-transaction`,
            { id: id, update: cleanUpdate }
        );
    }

    async getTransactionMatching(amount, account) {
        // For server implementation, we'll query the server
        const response = await axios.post(
            `${this.baseUrl}/get-transactions`,
            { amount: amount, account: account }
        );
        const matches = response.data.transactions;
        return matches.length > 0 ? matches[0] : null;
    }

    async addVendor(vendorData) {
        return axios.post(`${this.baseUrl}/add-vendor`, JSON.stringify(vendorData), {
            headers: {'Content-Type': 'application/json'}
        });
    }

    async updateCategory(categoryData) {
        return axios.post(`${this.baseUrl}/update-category`, JSON.stringify(categoryData), {
            headers: {'Content-Type': 'application/json'}
        });
    }

    fixOptionalTransaction(optionalTransaction) {
        if(optionalTransaction.vendor === "") {
            optionalTransaction.vendor = null
        }
        if(optionalTransaction.amount === "") {
            optionalTransaction.amount = null
        }
        if(optionalTransaction.account === "") {
            optionalTransaction.account = null
        }
        if(optionalTransaction.category === "") {
            optionalTransaction.category = null
        }

        if(optionalTransaction.type === "") {
            optionalTransaction.type = null
        }

        if(optionalTransaction.location === "") {
            optionalTransaction.location = null
        }
        return optionalTransaction
    }
}

// Create and export the finance API
const financeApi = new ServerFinanceProvider();
export default financeApi;