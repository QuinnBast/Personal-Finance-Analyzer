package bast.quinn.finance

import bast.quinn.finance.database.FinancialDataProvider
import bast.quinn.finance.database.Transaction
import bast.quinn.finance.database.VendorCategory
import bast.quinn.finance.models.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.http.content.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

const val CHEQUING_ACCOUNT_NAME = "Chequing"
const val CREDIT_ACCOUNT_NAME = "Credit"

fun Application.financeRouting(database: FinancialDataProvider) {
    routing {
        singlePageApplication {
            vue("vue/finance-vue/dist")
        }
        // Get a list of all categories.
        // Used to regex vendors to determine a category.
        get("vendor-categories") {
            val results = database.getPosCategories()
            val asSerializableMode: List<VendorCategoryApiModel> = results.map {
                VendorCategoryApiModel.fromVendorCategory(it)
            }
            call.respond<VendorCategoryList>(VendorCategoryList(asSerializableMode))
        }

        // Get recent Transactions
        // Default to transactions within the month, but accept query params to change the default.
        get("transactions") {
            var monthsAgo = call.request.queryParameters["monthsAgo"]?.toInt()
            if (monthsAgo == null) {
                // Default to 1 month ago.
                monthsAgo = 1
            }

            val endDate = LocalDateTime.now()
            val startDate = LocalDateTime.now().minusMonths(monthsAgo.toLong()).withDayOfMonth(1)

            call.respond<TransactionList>(
                TransactionList(
                    database.getTransactionsinRange(startDate, endDate)
                        .map { TransactionApiModel.fromTransaction(it) })
            )
        }

        // Import a list of transactions from CSV data.
        post("import-transactions") {
            val transactionRequest = call.receive<ImportTransactionRequest>()
            val transactions = transactionRequest.transactions.mapNotNull { requestedTransaction ->

                // Check if any of the transactions are a credit transaction with a FROM
                // This indicates an account transfer to pay off the credit card.
                // If a transaction exists like this, we should find the matching account transfer from the chequing account for the same amount
                // and delete it (because we have now accounted for each credit transactions individually)
                if (isCreditCardPayment(requestedTransaction)) {
                    this@financeRouting.log.info("Found creditcard payment. Checking for a matching transfer...")
                    // Lookup matching transaction and delete it if
                    val oppositeAccountName = if(requestedTransaction.account == CREDIT_ACCOUNT_NAME) {
                        CHEQUING_ACCOUNT_NAME
                    } else {
                        CREDIT_ACCOUNT_NAME
                    }

                    val transaction = database.getTransactionMatching(requestedTransaction.amount * -1, oppositeAccountName)
                    if(transaction != null) {
                        this@financeRouting.log.info("Found matching transaction in $oppositeAccountName account for $${requestedTransaction.amount}. Deleting this transaction.")
                        transaction.delete()
                        null
                    } else {
                        this@financeRouting.log.info("Could not find a matching transaction for $${requestedTransaction.amount} in $oppositeAccountName account.")
//                        Transaction {
//                            date = LocalDateTime.parse(requestedTransaction.date, DateTimeFormatter.ISO_LOCAL_DATE_TIME)
//                            vendor = requestedTransaction.vendor
//                            amount = requestedTransaction.amount
//                            account = requestedTransaction.account
//                            categoryOverride = requestedTransaction.category
//                            purchaseType = requestedTransaction.type
//                            location = requestedTransaction.location
//                        }
                        null
                    }
                } else {
                    Transaction {
                        date = LocalDateTime.parse(requestedTransaction.date, DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                        vendor = requestedTransaction.vendor
                        amount = requestedTransaction.amount
                        account = requestedTransaction.account
                        categoryOverride = requestedTransaction.category
                        purchaseType = requestedTransaction.type
                        location = requestedTransaction.location
                    }
                }
            }
            val result = database.insertTransactions(transactions)
            this@financeRouting.log.info("Imported ${transactions.size} transactions.")
            call.respond(HttpStatusCode.OK, ImportResult(result))
        }

        // Add a new POS category for a vendor
        post("add-vendor") {
            val vendorRequest = call.receive<NewVendorRequest>()

            val result = database.insertCategory(VendorCategory {
                vendor = vendorRequest.vendor
                categoryName = vendorRequest.category
                regexMaybe = vendorRequest.regexMaybe
            })

            this@financeRouting.log.info("Added vendor '$vendorRequest'.")
            call.respond(NewVendorResponse("Success", result))
        }

        delete("delete-vendor") {
            val deleteRequest = call.request.queryParameters["id"]?.toInt()
            if (deleteRequest != null) {
                database.deletePosCategory(deleteRequest)
                call.respond(HttpStatusCode.OK)
            } else {
                call.respond(HttpStatusCode.BadRequest)
            }
        }

        post("update-category") {
            val vendorRequest = call.receive<UpdateVendorCategoryRequest>()
            val response = database.updateVendorCategory(vendorRequest)

            if(response > 0) {
                call.respond(HttpStatusCode.OK)
            } else {
                call.respond(HttpStatusCode.BadRequest)
            }
        }
    }
}

private fun isCreditCardPayment(requestedTransaction: TransactionRequest) =
    (requestedTransaction.account == CREDIT_ACCOUNT_NAME && requestedTransaction.amount > 0)