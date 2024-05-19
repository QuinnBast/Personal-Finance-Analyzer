package bast.quinn.finance

import bast.quinn.finance.database.FinanceJdbcProvider
import bast.quinn.finance.database.VendorCategory
import bast.quinn.finance.models.*
import io.ktor.server.application.*
import io.ktor.server.http.content.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.LocalDateTime
import java.util.*

fun Application.serveRoutes(database: FinanceJdbcProvider) {
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

            call.respond<TransactionList>(TransactionList(database.getTransactionsinRange(startDate, endDate).map { TransactionApiModel.fromTransaction(it) }))
        }

        // Import a list of transactions from CSV data.
        post("csv-import") {

        }

        // Add a new POS category for a vendor
        post("add-vendor") {
            val vendorRequest = call.receive<NewVendorRequest>()

            val result = database.insertCategory(VendorCategory {
                vendor = vendorRequest.vendor
                categoryName = vendorRequest.categoryName
            })

            call.respond(NewVendorResponse("Success", result))
        }
    }
}