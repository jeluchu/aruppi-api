package com.jeluchu.features.anime.services

import com.jeluchu.core.enums.TimeUnit
import com.jeluchu.core.enums.parseAnimeType
import com.jeluchu.core.extensions.needsUpdate
import com.jeluchu.core.extensions.update
import com.jeluchu.core.messages.ErrorMessages
import com.jeluchu.core.models.ErrorResponse
import com.jeluchu.core.models.PaginationResponse
import com.jeluchu.core.utils.Collections
import com.jeluchu.core.utils.TimerKey
import com.jeluchu.features.anime.mappers.documentToAnimeTypeEntity
import com.mongodb.client.MongoDatabase
import com.mongodb.client.model.Filters
import io.ktor.http.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.bson.Document

class DirectoryService(
    private val database: MongoDatabase
) {
    private val timers = database.getCollection(Collections.TIMERS)
    private val directory = database.getCollection(Collections.ANIME_DETAILS)

    suspend fun getAnimeByType(call: RoutingCall) {
        val page = call.request.queryParameters["page"]?.toIntOrNull() ?: 1
        val size = call.request.queryParameters["size"]?.toIntOrNull() ?: 10
        val param = call.parameters["type"] ?: throw IllegalArgumentException(ErrorMessages.InvalidAnimeType.message)

        if (page < 1 || size < 1) call.respond(HttpStatusCode.BadRequest, ErrorMessages.InvalidSizeAndPage.message)
        val skipCount = (page - 1) * size

        if (parseAnimeType(param) == null) call.respond(
            HttpStatusCode.BadRequest,
            ErrorResponse(ErrorMessages.InvalidAnimeType.message)
        )

        val timerKey = "${TimerKey.ANIME_TYPE}${param.lowercase()}"
        val needsUpdate = timers.needsUpdate(
            amount = 30,
            key = timerKey,
            unit = TimeUnit.DAY,
        )

        if (needsUpdate) {
            val collection = database.getCollection(timerKey)
            collection.deleteMany(Document())

            val animes = directory
                .find(Filters.eq("type", param.uppercase()))
                .skip(skipCount)
                .limit(size)
                .toList()

            val animeTypes = animes.map { documentToAnimeTypeEntity(it) }
            val documents = animeTypes.map { anime -> Document.parse(Json.encodeToString(anime)) }
            if (documents.isNotEmpty()) collection.insertMany(documents)
            timers.update(timerKey)

            val response = PaginationResponse(
                page = page,
                size = size,
                data = animeTypes,
                totalItems = directory.countDocuments().toInt()
            )

            call.respond(HttpStatusCode.OK, Json.encodeToString(response))
        } else {
            val elements = directory.find()
                .skip(skipCount)
                .limit(size)
                .toList()

            val response = PaginationResponse(
                page = page,
                size = size,
                totalItems = directory.countDocuments().toInt(),
                data = elements.map { documentToAnimeTypeEntity(it) }
            )

            call.respond(HttpStatusCode.OK, Json.encodeToString(response))
        }
    }

    private fun List<Document>.documentAnimeTypeMapper(): String {
        val directory = map { documentToAnimeTypeEntity(it) }
        return Json.encodeToString(directory)
    }
}