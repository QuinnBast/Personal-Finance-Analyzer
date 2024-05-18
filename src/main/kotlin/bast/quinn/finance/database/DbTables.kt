package bast.quinn.finance.database

import org.ktorm.database.Database
import org.ktorm.entity.Entity
import org.ktorm.entity.sequenceOf
import org.ktorm.schema.*
import java.time.LocalDateTime

// Databases
object Transactions : Table<Transaction>("t_transaction") {
    val id = int("id").primaryKey().bindTo { it.id }
    val date = datetime("date").bindTo { it.date }
    val vendor = varchar("vendor").bindTo { it.vendor }
    val amount = double("amount").bindTo { it.amount }
    val account = varchar("account").bindTo { it.account }
    val categoryOverride = varchar("category_override").bindTo { it.categoryOverride }
    val purchaseType = varchar("purchase_type").bindTo { it.purchaseType }
    val location = varchar("location").bindTo { it.location }
}

object VendorCategories : Table<VendorCategory>("t_vendor_categories") {
    val id = int("id").primaryKey().bindTo { it.id }
    val vendor = varchar("vendor").bindTo { it.vendor }
    val categoryName = varchar("category_name").bindTo { it.categoryName }
}

// Extension functions to help get tables faster
val Database.transactions get() = this.sequenceOf(Transactions)
val Database.vendorCategories get() = this.sequenceOf(VendorCategories)

// Individual Database Rows
interface Transaction : Entity<Transaction> {
    companion object : Entity.Factory<Transaction>()
    val id: Int
    var date: LocalDateTime
    var vendor: String
    var amount: Double
    var account: String
    var categoryOverride: String?
    var purchaseType: String
    var location: String
}

interface VendorCategory : Entity<VendorCategory> {
    companion object : Entity.Factory<VendorCategory>()
    val id: Int
    var vendor: String
    var categoryName: String
}