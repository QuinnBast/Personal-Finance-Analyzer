package bast.quinn.finance

import bast.quinn.finance.config.ServerConfig
import bast.quinn.finance.database.FinanceJdbcProvider
import bast.quinn.finance.database.Transaction
import bast.quinn.finance.database.VendorCategory
import bast.quinn.finance.models.*
import com.sksamuel.hoplite.ConfigLoaderBuilder
import com.sksamuel.hoplite.addResourceSource
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.http.content.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.callloging.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.slf4j.LoggerFactory
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

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
                allowMethod(HttpMethod.Put)
                allowMethod(HttpMethod.Delete)
                allowMethod(HttpMethod.Post)
                allowMethod(HttpMethod.Get)
            }
            install(CallLogging)
            install(ContentNegotiation) { json() }
            financeRouting(database)
        }.start(wait = true)
    }
}

fun main() {
    PersonalFinanceMain().run()
}