package bast.quinn.finance.database

import io.ktor.server.util.*
import io.ktor.util.*
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.ktorm.dsl.*
import org.ktorm.entity.all
import org.ktorm.entity.filter
import org.ktorm.entity.map
import org.ktorm.entity.toList
import java.io.FileInputStream
import java.time.LocalDateTime
import java.util.*

fun main(args: Array<String>) {
    val database = FinanceJdbcProvider("jdbc:sqlite:finance.db")
    DatabasePopulator().deleteCreditTransactions(database)
    // DatabasePopulator().updateTransactionCategories(database)
//    DatabasePopulator().populateCategoryList(database)
//    DatabasePopulator().populateTransactions(database)
//    println("Database populated! Verifying...")
//    println("${database.getPosCategories().size} categories")
//    println("${database.getTrasactionsSince(LocalDateTime.now().minusMonths(6)).size} transactions in 6 months")
}

class DatabasePopulator {
    fun deleteCreditTransactions(database :FinanceJdbcProvider) {
        database.database.delete(Transactions) {
            it.account eq "Credit"
        }
    }

    fun updateTransactionCategories(database: FinanceJdbcProvider) {
        val vendorList = database.database.vendorCategories.toList()
        val transactionList = database.database.transactions.toList().forEach { transaction ->
            // Check if category needs updated.
            val matchingVendor = vendorList.firstOrNull {
                if(it.regexMaybe != null && it.regexMaybe != "") {
                    val regex = Regex(it.regexMaybe!!)
                    regex.containsMatchIn(transaction.vendor)
                } else {
                    it.vendor == transaction.vendor
                }
            }

            if(matchingVendor != null) {
                if(matchingVendor.categoryName != transaction.categoryOverride) {

                    database.database.update(Transactions) {
                        set(it.categoryOverride, matchingVendor.categoryName)
                        where {
                            it.id eq transaction.id
                        }
                    }

                    println("${transaction.vendor} updated from ${transaction.categoryOverride} to ${matchingVendor.categoryName}")
                }
            }
        }
    }

    fun populateCategoryList(database: FinanceJdbcProvider) {
        println("Populating category list")
        val fis = FileInputStream("C:\\Users\\Quinn\\Documents\\Coding\\PersonalFinance\\src\\main\\resources\\Budget.xlsm")
        val workbook = XSSFWorkbook(fis)

        val posCategorySheet = workbook.getSheet("POS Categories")
        posCategorySheet.iterator().forEach { row ->
            val vendorString = row.getCell(0).stringCellValue
            val category = row.getCell(1).stringCellValue

            val (realVendor, location) = parseVendorString(vendorString)

            database.insertCategory(VendorCategory {
                vendor = realVendor
                categoryName = category
            })
        }
        println("Populated Categories")
    }

    @OptIn(InternalAPI::class)
    fun populateTransactions(database: FinanceJdbcProvider) {
        val fis = FileInputStream("C:\\Users\\Quinn\\Documents\\Coding\\PersonalFinance\\src\\main\\resources\\Budget.xlsm")
        val workbook = XSSFWorkbook(fis)

        workbook.sheetIterator().forEach { sheet ->
            val sheetLast4 = sheet.sheetName.takeLast(4)
            try {
                val asInt = sheetLast4.toInt()
                // If parsed, it is a year of a sheet.
                // We should insert transactions.
                println("Loading transactions from ${sheet.sheetName}")

                val transactions = mutableListOf<Transaction>()

                sheet.rowIterator().forEach { row ->
                    val shortDate: LocalDateTime = try {
                        row.getCell(0).dateCellValue.toLocalDateTime()
                    } catch(e: IllegalStateException) {
                        Date(row.getCell(0).stringCellValue).toLocalDateTime()
                    }
                    val purchaseAmount = row.getCell(1).numericCellValue
                    // val unknown = row.getCell(2).stringCellValue.trim()
                    val type = row.getCell(3).stringCellValue.trim()

                    var vendorString = "Unknown"
                    var locationString = "Unknown"
                    try {
                        val result = parseVendorString(row.getCell(4).stringCellValue.trim())
                        vendorString = result.first
                        locationString = result.second
                    } catch (e: NullPointerException) {
                        println("Vendor is empty")
                    } catch (e: IllegalStateException) {
                        vendorString = row.getCell(4).numericCellValue.toString()
                        locationString = "Unknown"
                    }

                    val category = row.getCell(5).stringCellValue.trim()

                    val transaction = Transaction {
                        date = shortDate
                        vendor = vendorString
                        amount = purchaseAmount
                        account = "Chequing"
                        categoryOverride = category
                        purchaseType = type
                        location = locationString
                    }

                    println(transaction.toString())
                    transactions.add(transaction)
                }

                database.insertTransactions(transactions)
                transactions.clear()
            } catch (e: NumberFormatException) {
                println("No: $sheetLast4")
            }
        }

    }

    fun parseVendorString(vendorString: String): Pair<String, String> {
        val realVendor = vendorString.take(25).trim()
        val remaining = vendorString.drop(25)
        val location = remaining.ifEmpty { "" }
        return realVendor to location
    }
}

