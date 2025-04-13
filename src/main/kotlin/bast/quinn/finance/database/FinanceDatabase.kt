package bast.quinn.finance.database

import bast.quinn.finance.models.OptionalTransaction
import bast.quinn.finance.models.UpdateVendorCategoryRequest
import org.ktorm.database.Database
import org.ktorm.dsl.*
import org.ktorm.entity.*
import org.slf4j.LoggerFactory
import java.sql.SQLException
import java.time.LocalDateTime
import java.time.temporal.TemporalAdjusters.firstDayOfMonth
import java.time.temporal.TemporalAdjusters.lastDayOfMonth


interface FinancialDataProvider {
    fun getPosCategories():List<VendorCategory>
    fun deletePosCategory(index:Int): Int
    fun getTrasactionsSince(date: LocalDateTime): List<Transaction>
    fun getTrasactionsWithinMonth(date: LocalDateTime): List<Transaction>
    fun getTransactionsinRange(startDate: LocalDateTime, endDate: LocalDateTime): List<Transaction>
    fun insertCategory(category: VendorCategory): Int
    fun insertCategories(categories: List<VendorCategory>): List<Int>
    fun insertTransaction(transaction: Transaction): Int
    fun insertTransactions(transactions: List<Transaction>): List<Int>
    fun getTransactionMatching(amount: Double, account: String): Transaction?
    fun getTransactions(transactionQuery: OptionalTransaction): List<Transaction>
    fun getVendorCategoryById(id: Int): VendorCategory?
    fun updateVendorCategory(updateVendorCategoryRequest: UpdateVendorCategoryRequest): Int
    fun updateTransaction(id: Int, transactionUpdate: OptionalTransaction): Int
}

class FinanceJdbcProvider(
    connectionString: String
) :  FinancialDataProvider {

    companion object {
        val logger = LoggerFactory.getLogger(FinanceJdbcProvider::class.java)!!
    }

    val database = Database.connect(connectionString)

    init {
        try {
            DatabaseMigrations(connectionString).performMigrations()
        } catch (e: SQLException) {
            logger.error(e.stackTraceToString())
        }
    }


    override fun getPosCategories(): List<VendorCategory> {
        val categories = database.vendorCategories.toList()
        logger.info("Fetched ${categories.size} categories")
        return categories
    }

    override fun deletePosCategory(index: Int): Int {
        val vendor = database.vendorCategories.filter { it.id eq index }.toList()
        if(vendor.size > 0) {
            return vendor[0].delete()
        }
        return 0
    }

    override fun getTrasactionsSince(date: LocalDateTime): List<Transaction> {
        val transactions = database.transactions.filter { it.date greater date }.toList()
        logger.info("Fetched ${transactions.size} transactions since $date")
        return transactions
    }

    override fun getTrasactionsWithinMonth(date: LocalDateTime): List<Transaction> {
        val startOfMonth = date.with(firstDayOfMonth())
        val endOfMonth = date.with(lastDayOfMonth())

        val transactions = getTransactionsinRange(startOfMonth, endOfMonth)
        logger.info("Fetched ${transactions.size} transactions within month")
        return transactions
    }

    override fun getTransactionsinRange(startDate: LocalDateTime, endDate: LocalDateTime): List<Transaction> {
        val transactions = database.transactions.filter { (it.date greaterEq startDate) and (it.date lessEq endDate) }.toList()
        logger.info("Fetched ${transactions.size} transactions between $startDate and $endDate")
        return transactions
    }

    override fun insertCategory(category: VendorCategory): Int {
        logger.info("Inserting category $category")
        return database.vendorCategories.add(category)
    }

    override fun insertCategories(categories: List<VendorCategory>): List<Int> {
        return if (categories.isEmpty()) {
            listOf()
        } else {
            database.batchInsert(database.vendorCategories.sourceTable) {
                categories.forEach { category ->
                    item {
                        set(it.vendor, category.vendor)
                        set(it.categoryName, category.categoryName)
                    }
                }
            }.toList()
        }
    }

    override fun insertTransaction(transaction: Transaction): Int {
        logger.info("Inserting transaction $transaction")
        return database.transactions.add(transaction)
    }

    override fun insertTransactions(transactions: List<Transaction>): List<Int> {
        return if(transactions.isEmpty()) {
            listOf()
        } else {
            logger.info("Imported ${transactions.size} transactions")
            database.batchInsert(database.transactions.sourceTable) {
                transactions.forEach { transaction ->
                    item {
                        set(it.date, transaction.date)
                        set(it.vendor, transaction.vendor)
                        set(it.amount, transaction.amount)
                        set(it.account, transaction.account)
                        set(it.categoryOverride, transaction.categoryOverride)
                        set(it.purchaseType, transaction.purchaseType)
                        set(it.location, transaction.location)
                    }
                }
            }.toList()
        }
    }

    override fun getTransactionMatching(amount: Double, account: String): Transaction? {
        return database.transactions.filter {
            (it.amount eq amount) and (it.account eq account)
        }.firstOrNull()
    }

    override fun getTransactions(transactionQuery: OptionalTransaction): List<Transaction> {
        var transactions = database.transactions

        if(transactionQuery.vendor != null) {
            transactions = transactions.filter { (it.vendor like "%${transactionQuery.vendor}%") }
        }
        if(transactionQuery.amount != null) {
            transactions = transactions.filter { (it.amount eq transactionQuery.amount!!) }
        }
        if(transactionQuery.account != null) {
            transactions = transactions.filter { (it.account eq "${transactionQuery.account}") }
        }
        if(transactionQuery.category != null) {
            transactions = transactions.filter { (it.categoryOverride eq "${transactionQuery.category}") }
        }
        if(transactionQuery.type != null) {
            transactions = transactions.filter { (it.purchaseType eq "${transactionQuery.type}") }
        }
        if(transactionQuery.location != null) {
            transactions = transactions.filter { (it.location eq "${transactionQuery.location}") }
        }

        return transactions.toList()
    }

    override fun getVendorCategoryById(id: Int): VendorCategory? {
        return database.vendorCategories.find { it.id eq id }
    }

    override fun updateVendorCategory(updateVendorCategoryRequest: UpdateVendorCategoryRequest): Int {
        return database.update(VendorCategories) {
            set(it.vendor, updateVendorCategoryRequest.vendor)
            set(it.categoryName, updateVendorCategoryRequest.categoryName)
            set(it.regexMaybe, updateVendorCategoryRequest.regexMaybe)
            where {
                it.id eq updateVendorCategoryRequest.id
            }
        }
    }

    override fun updateTransaction(id: Int, transactionUpdate: OptionalTransaction): Int {
        return database.update(Transactions) {
            if(transactionUpdate.vendor != null && transactionUpdate.vendor != "") {
                set(it.vendor, transactionUpdate.vendor)
            }
            if(transactionUpdate.amount != null) {
                set(it.amount, transactionUpdate.amount)
            }
            if(transactionUpdate.account != null && transactionUpdate.account != "") {
                set(it.account, transactionUpdate.account)
            }
            if(transactionUpdate.category != null && transactionUpdate.category != "") {
                set(it.categoryOverride, transactionUpdate.category)
            }
            if(transactionUpdate.type != null && transactionUpdate.type != "") {
                set(it.purchaseType, transactionUpdate.type)
            }
            if(transactionUpdate.location != null && transactionUpdate.location != "") {
                set(it.location, transactionUpdate.location)
            }
            where {
                it.id eq id
            }
        }
    }
}