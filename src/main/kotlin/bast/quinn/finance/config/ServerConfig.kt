package bast.quinn.finance.config

data class ServerConfig(
    val host: String = "localhost",
    val port: Int = 9000,
    val persistence: PersistenceConfig,
)

data class PersistenceConfig(
    val sqliteFile: String = "finance.db",
    val database: String = "Finance"
)