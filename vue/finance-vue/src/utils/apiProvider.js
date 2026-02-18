import financeApi from './api.js';
import localDb from './localDb.js';

class FinanceApiFactory {
    constructor() {
        this.useLocal = true;
        this.provider = this.useLocal ? localDb : financeApi;
    }

    // Allow switching between local and server implementations
    setUseLocal(useLocal) {
        this.useLocal = useLocal;
        this.provider = this.useLocal ? localDb : financeApi;
    }

    // Proxy all methods to the selected provider
    async getPosCategories() {
        return this.provider.getPosCategories();
    }

    async getTransactionsSinceMonthsAgo(monthsAgo) {
        return this.provider.getTransactionsSinceMonthsAgo(monthsAgo);
    }

    async insertCategory(newCategory) {
        return this.provider.insertCategory(newCategory);
    }

    async importTransactions(transactionsToImport) {
        return this.provider.importTransactions(transactionsToImport);
    }

    async getTransactions(transactionQuery) {
        return this.provider.getTransactions(transactionQuery);
    }

    async getTransactionMatching(amount, account) {
        return this.provider.getTransactionMatching(amount, account);
    }

    async getVendorOverrides() {
        return this.provider.getVendorOverrides();
    }

    async deleteVendor(vendorIdToDelete) {
        return this.provider.deleteVendor(vendorIdToDelete);
    }

    async updateTransaction(id, updateData) {
        return this.provider.updateTransaction(id, updateData);
    }

    async addVendor(vendorData) {
        return this.provider.addVendor(vendorData);
    }

    async updateCategory(categoryData) {
        return this.provider.updateCategory(categoryData);
    }
}

const api = new FinanceApiFactory();
export default api;