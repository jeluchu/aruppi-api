package com.jeluchu.features.anime.services

import com.jeluchu.core.connection.RestClient
import com.jeluchu.core.enums.TimeUnit
import com.jeluchu.core.enums.parseAnimeType
import com.jeluchu.core.extensions.needsUpdate
import com.jeluchu.core.extensions.update
import com.jeluchu.core.messages.ErrorMessages
import com.jeluchu.core.models.ErrorResponse
import com.jeluchu.core.models.PaginationResponse
import com.jeluchu.features.anime.models.lastepisodes.LastEpisodeData
import com.jeluchu.features.anime.models.lastepisodes.LastEpisodeData.Companion.toLastEpisodeData
import com.jeluchu.core.models.jikan.search.AnimeSearch
import com.jeluchu.core.utils.BaseUrls
import com.jeluchu.core.utils.Collections
import com.jeluchu.core.utils.TimerKey
import com.jeluchu.core.utils.parseDataToDocuments
import com.jeluchu.features.anime.mappers.documentToAnimeLastEpisodeEntity
import com.jeluchu.features.anime.mappers.documentToAnimeTypeEntity
import com.jeluchu.features.anime.mappers.documentToMoreInfoEntity
import com.mongodb.client.MongoDatabase
import com.mongodb.client.model.Filters.eq
import io.ktor.http.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.coroutines.delay
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.bson.Document
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.*

class AnimeService(
    private val database: MongoDatabase
) {
    private val timers = database.getCollection(Collections.TIMERS)
    private val directoryCollection = database.getCollection(Collections.ANIME_DETAILS)
    private val lastEpisodesCollection = database.getCollection(Collections.LAST_EPISODES)

    suspend fun getDirectory(call: RoutingCall) = try {
        val type = call.request.queryParameters["type"].orEmpty()
        val page = call.request.queryParameters["page"]?.toIntOrNull() ?: 1
        val size = call.request.queryParameters["size"]?.toIntOrNull() ?: 10

        if (page < 1 || size < 1) call.respond(HttpStatusCode.BadRequest, ErrorMessages.InvalidSizeAndPage.message)
        val skipCount = (page - 1) * size

        if (parseAnimeType(type) == null) {
            val animes = directoryCollection
                .find()
                .skip(skipCount)
                .limit(size)
                .toList()

            val elements = animes.map { documentToAnimeTypeEntity(it) }

            val response = PaginationResponse(
                page = page,
                size = size,
                data = elements
            )

            call.respond(HttpStatusCode.OK, Json.encodeToString(response))
        } else {
            val animes = directoryCollection
                .find(eq("type", type.uppercase()))
                .skip(skipCount)
                .limit(size)
                .toList()

            val elements = animes.map { documentToAnimeTypeEntity(it) }

            val response = PaginationResponse(
                page = page,
                size = size,
                data = elements
            )

            call.respond(HttpStatusCode.OK, Json.encodeToString(response))
        }
    } catch (ex: Exception) {
        call.respond(HttpStatusCode.Unauthorized, ErrorResponse(ErrorMessages.UnauthorizedMongo.message))
    }

    suspend fun getAnimeByMalId(call: RoutingCall) = try {
        val id = call.parameters["id"]?.toInt() ?: throw IllegalArgumentException(ErrorMessages.InvalidMalId.message)
        directoryCollection.find(eq("malId", id)).firstOrNull()?.let { anime ->
            val info = documentToMoreInfoEntity(anime)
            call.respond(HttpStatusCode.OK, Json.encodeToString(info))
        } ?: call.respond(HttpStatusCode.NotFound, ErrorResponse(ErrorMessages.AnimeNotFound.message))
    } catch (ex: Exception) {
        call.respond(HttpStatusCode.NotFound, ErrorResponse(ErrorMessages.InvalidInput.message))
    }

    suspend fun getLastEpisodes(call: RoutingCall) = try {
        val dayOfWeek = LocalDate.now()
            .dayOfWeek
            .getDisplayName(TextStyle.FULL, Locale.ENGLISH)
            .plus("s")

        val timerKey = TimerKey.LAST_EPISODES
        val collection = database.getCollection(timerKey)

        val needsUpdate = timers.needsUpdate(
            amount = 6,
            key = timerKey,
            unit = TimeUnit.HOUR,
        )

        if (needsUpdate) {
            collection.deleteMany(Document())

            val response = RestClient.request(
                BaseUrls.JIKAN + "anime?status=airing&type=tv",
                AnimeSearch.serializer()
            )

            val animes = mutableListOf<LastEpisodeData>()
            val totalPage = response.pagination?.lastPage ?: 0
            response.data?.map { it.toLastEpisodeData() }.orEmpty().let { animes.addAll(it) }

            for (page in 2..totalPage) {
                val responsePage = RestClient.request(
                    BaseUrls.JIKAN + "anime?status=airing&type=tv&page=$page",
                    AnimeSearch.serializer()
                ).data?.map { it.toLastEpisodeData() }.orEmpty()

                animes.addAll(responsePage)
                delay(1000)
            }

            val documentsToInsert = parseDataToDocuments(animes, LastEpisodeData.serializer())
            if (documentsToInsert.isNotEmpty()) collection.insertMany(documentsToInsert)
            timers.update(timerKey)

            val queryDb = collection
                .find(eq("day", dayOfWeek))
                .toList()

            val elements = queryDb.map { documentToAnimeLastEpisodeEntity(it) }
            call.respond(HttpStatusCode.OK, Json.encodeToString(elements))
        } else {
            val elements = collection
                .find(eq("day", dayOfWeek))
                .toList()
                .map { documentToAnimeLastEpisodeEntity(it) }

            call.respond(HttpStatusCode.OK, Json.encodeToString(elements))
        }
    } catch (ex: Exception) {
        call.respond(HttpStatusCode.Unauthorized, ErrorResponse(ErrorMessages.UnauthorizedMongo.message))
    }
}