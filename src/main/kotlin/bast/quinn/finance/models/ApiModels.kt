package bast.quinn.finance.models

import bast.quinn.finance.database.Transaction
import bast.quinn.finance.database.VendorCategory
import kotlinx.serialization.Serializable

@Serializable
data class TransactionList(
    val transactions: List<TransactionApiModel>
)

@Serializable
data class VendorCategoryList(
    val vendorCategories: List<VendorCategoryApiModel>
)

@Serializable
data class TransactionApiModel (
    val id: Int,
    var date: kotlinx.datetime.LocalDateTime,
    var vendor: String,
    var amount: Double,
    var account: String,
    var categoryOverride: String?,
    var purchaseType: String,
    var location: String?,
) {
    companion object {
        fun fromTransaction(transaction: Transaction) = TransactionApiModel(
            transaction.id,
            kotlinx.datetime.LocalDateTime(transaction.date.year, transaction.date.monthValue, transaction.date.dayOfMonth, transaction.date.hour, transaction.date.minute, transaction.date.second),
            transaction.vendor,
            transaction.amount,
            transaction.account,
            transaction.categoryOverride,
            transaction.purchaseType,
            transaction.location,
        )
    }
}

@Serializable
data class VendorCategoryApiModel(
    val id: Int,
    var vendor: String,
    var categoryName: String,
) {
    companion object {
        fun fromVendorCategory(category: VendorCategory) = VendorCategoryApiModel(
            category.id,
            category.vendor,
            category.categoryName,
        )
    }
}

@Serializable
data class NewVendorRequest(
    var vendor: String,
    var categoryName: String,
)

@Serializable
data class NewVendorResponse(
    var status: String,
    var insertId: Int,
)