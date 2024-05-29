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
    var regexMaybe: String?
) {
    companion object {
        fun fromVendorCategory(category: VendorCategory) = VendorCategoryApiModel(
            category.id,
            category.vendor,
            category.categoryName,
            category.regexMaybe
        )
    }
}

@Serializable
data class NewVendorRequest(
    val vendor: String,
    val category: String,
    val regexMaybe: String?
)

@Serializable
data class NewVendorResponse(
    val status: String,
    val insertId: Int,
)

@Serializable
data class ImportTransactionRequest(
    val transactions: List<TransactionRequest>
)

@Serializable
data class TransactionRequest(
    var date: String,
    var vendor: String,
    var amount: Double,
    var account: String,
    var category: String,
    var type: String,
    var location: String,
)

@Serializable
data class ImportResult(
    val insertedIds: List<Int>,
)

@Serializable
data class UpdateVendorCategoryRequest(
    val id: Int,
    val vendor: String,
    val categoryName: String,
    val regexMaybe: String?
)

@Serializable
data class UpdateVendorCategoryResponse(
    val status: String,
)