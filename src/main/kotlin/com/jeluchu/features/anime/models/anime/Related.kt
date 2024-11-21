package com.example.models

import kotlinx.serialization.Serializable

@Serializable
data class Related(
    /**
     * List of entries for relation in anime.
     * @see Companies
     */
    val entry: List<Companies>,

    /**
     * Relation for anime.
     */
    val relation: String
)