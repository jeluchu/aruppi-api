package com.jeluchu.features.anime.services

import com.jeluchu.core.messages.ErrorMessages
import com.jeluchu.core.models.ErrorResponse
import com.jeluchu.features.anime.mappers.documentToMoreInfoEntity
import com.jeluchu.features.anime.mappers.toMoreInfoEntity
import com.mongodb.client.MongoDatabase
import com.mongodb.client.model.Filters
import io.ktor.http.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class AnimeService(
    database: MongoDatabase
) {
    private val directoryCollection = database.getCollection("animedetails")

    suspend fun getDirectory(
        call: RoutingCall
    ) = withContext(Dispatchers.IO) {
        call.response.headers.append(HttpHeaders.ContentType, ContentType.Application.Json.toString())

        try {
            val elements = directoryCollection.find().toList()
            val directory = elements.map { documentToMoreInfoEntity(it) }
            val json = Json.encodeToString(directory)
            call.respond(HttpStatusCode.OK, json)
        } catch (ex: Exception) {
            call.respond(HttpStatusCode.Unauthorized, ErrorResponse(ErrorMessages.UnauthorizedMongo.message))
        }
    }

    suspend fun getAnimeByMalId(
        call: RoutingCall
    ) = withContext(Dispatchers.IO) {
        call.response.headers.append(HttpHeaders.ContentType, ContentType.Application.Json.toString())

        try {
            val id = call.parameters["id"]?.toInt() ?: throw IllegalArgumentException(ErrorMessages.InvalidMalId.message)
            directoryCollection.find(Filters.eq("malId", id)).firstOrNull()?.let { anime ->
                val info = documentToMoreInfoEntity(anime)
                call.respond(HttpStatusCode.OK, Json.encodeToString(info))
            } ?: call.respond(HttpStatusCode.NotFound, ErrorResponse(ErrorMessages.AnimeNotFound.message))
        } catch (ex: Exception) {
            call.respond(HttpStatusCode.NotFound, ErrorResponse(ErrorMessages.InvalidInput.message))
        }
    }
}

