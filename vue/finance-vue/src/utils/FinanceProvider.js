class FinanceProvider {
    constructor() {}

    async getPosCategories() { throw new Error('Not implemented'); }
    async getTransactionsSinceMonthsAgo(monthsAgo) { throw new Error('Not implemented'); }
    async insertCategory(newCategory) { throw new Error('Not implemented'); }
    async importTransactions(transactionsToImport) { throw new Error('Not implemented'); }
    async getTransactions(transactionQuery) { throw new Error('Not implemented'); }
    async getTransactionMatching(amount, account) { throw new Error('Not implemented'); }
    async getVendorOverrides() { throw new Error('Not implemented'); }
    async deleteVendor(vendorIdToDelete) { throw new Error('Not implemented'); }
    async updateTransaction(id, updateData) { throw new Error('Not implemented'); }
    async addVendor(vendorData) { throw new Error('Not implemented'); }
    async updateCategory(categoryData) { throw new Error('Not implemented'); }
}

export default FinanceProvider;