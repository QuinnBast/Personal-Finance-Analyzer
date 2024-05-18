package bast.quinn.finance.database

import org.ktorm.database.Database
import org.ktorm.dsl.*
import org.ktorm.entity.add
import org.ktorm.entity.filter
import org.ktorm.entity.toList
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

    val database = Database.connect(connectionString)

    init {
        try {
            DatabaseMigrations(connectionString).performMigrations()
        } catch (e: SQLException) {
            e.printStackTrace(System.err)
        }
    }


    override fun getPosCategories(): List<VendorCategory> {
        return database.vendorCategories.toList()
    }

    override fun getTrasactionsSince(date: LocalDateTime): List<Transaction> {
        return database.transactions.filter { it.date greater date }.toList()
    }

    override fun getTrasactionsWithinMonth(date: LocalDateTime): List<Transaction> {
        val startOfMonth = date.with(firstDayOfMonth())
        val endOfMonth = date.with(lastDayOfMonth())

        return getTransactionsinRange(startOfMonth, endOfMonth)
    }

    override fun getTransactionsinRange(startDate: LocalDateTime, endDate: LocalDateTime): List<Transaction> {
        return database.transactions.filter { (it.date greaterEq startDate) and (it.date lessEq endDate) }.toList()
    }

    override fun insertCategory(category: VendorCategory): Int {
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