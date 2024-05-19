package bast.quinn.finance.database

import bast.quinn.finance.database.Transactions.date
import org.ktorm.database.Database
import org.ktorm.dsl.*
import org.ktorm.entity.add
import org.ktorm.entity.filter
import org.ktorm.entity.toList
import org.slf4j.LoggerFactory
import java.sql.SQLException
import java.time.LocalDateTime
import java.time.temporal.TemporalAdjusters.firstDayOfMonth
import java.time.temporal.TemporalAdjusters.lastDayOfMonth


interface FinancialDataProvider {
    fun getPosCategories():List<VendorCategory>
    fun getTrasactionsSince(date: LocalDateTime): List<Transaction>
    fun getTrasactionsWithinMonth(date: LocalDateTime): List<Transaction>
    fun getTransactionsinRange(startDate: LocalDateTime, endDate: LocalDateTime): List<Transaction>
    fun insertCategory(category: VendorCategory): Int
    fun insertCategories(categories: List<VendorCategory>): List<Int>
    fun insertTransaction(transaction: Transaction): Int
    fun insertTransactions(transactions: List<Transaction>): List<Int>
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

}