package bast.quinn.finance.database

import java.sql.DriverManager
import java.sql.Statement

class DatabaseMigrations(
    val connectionString: String
) {
    fun performMigrations() {
        DriverManager.getConnection(connectionString).use { connection ->
            connection.createStatement().use { statement ->
                statement.queryTimeout = 30 // set timeout to 30 sec.

                createTables(statement)
            }
        }
    }



    private fun createTables(statement: Statement) {
        statement.executeUpdate(
            """create table if not exists t_transaction (
                        id integer primary key autoincrement,
                        date datetime,
                        vendor string,
                        amount double,
                        account string,
                        category_override string,
                        purchase_type string,
                        location string
                        )"""
        )
        statement.executeUpdate(
            """create table if not exists t_vendor_categories (
                        id integer primary key autoincrement,
                        vendor string,
                        category_name string,
                        regex_maybe string
                        )"""
        )
    }
}