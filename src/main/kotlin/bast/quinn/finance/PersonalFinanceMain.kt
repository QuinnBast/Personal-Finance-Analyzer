package bast.quinn.finance

import bast.quinn.finance.config.ServerConfig
import bast.quinn.finance.database.FinanceJdbcProvider
import com.sksamuel.hoplite.ConfigLoaderBuilder
import com.sksamuel.hoplite.addResourceSource
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.callloging.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import org.slf4j.LoggerFactory

class PersonalFinanceMain {

    companion object {
        val logger = LoggerFactory.getLogger(PersonalFinanceMain::class.java)
    }

    fun run() {
        val config = ConfigLoaderBuilder.default()
            .addResourceSource("/finance-server-config.yaml")
            .build()
            .loadConfigOrThrow<ServerConfig>()

        val database = FinanceJdbcProvider("jdbc:sqlite:finance.db")


        logger.info("Config: {}", config)

        embeddedServer(Netty, host = config.host, port = config.port) {
            install(CORS) {
                anyHost()
                allowHeader(HttpHeaders.ContentType)
            }
            install(CallLogging)
            install(ContentNegotiation) { json() }
            serveRoutes(database)
        }.start(wait = true)
    }
}

fun main() {
    PersonalFinanceMain().run()
}