package tech.threedvr.companion

import android.content.Context
import android.content.Intent
import android.provider.Settings

/**
 * Tiny, explicit voice command router for the first Assistant round-trip.
 *
 * This is intentionally not a general natural-language executor. It only
 * recognizes a small set of "open known app" requests and maps them to the
 * same bounded app aliases admitted by Companion's remote relay.
 */
object CompanionVoiceCommandRouter {
    data class Route(
        val capabilityId: String,
        val alias: String,
    )

    data class Execution(
        val ok: Boolean,
        val code: String,
        val alias: String,
    )

    private val commandPatterns = linkedMapOf(
        "maps" to Regex("\\b(?:open|launch|start)\\s+(?:my\\s+)?(?:google\\s+)?maps\\b"),
        "gmail" to Regex("\\b(?:open|launch|start)\\s+(?:my\\s+)?gmail\\b"),
        "camera" to Regex("\\b(?:open|launch|start)\\s+(?:my\\s+)?camera\\b"),
        "messages" to Regex("\\b(?:open|launch|start)\\s+(?:my\\s+)?(?:text\\s+)?messages\\b"),
        "whatsapp" to Regex("\\b(?:open|launch|start)\\s+(?:my\\s+)?whats\\s*app\\b"),
        "calendar" to Regex("\\b(?:open|launch|start)\\s+(?:my\\s+)?calendar\\b"),
        "chrome" to Regex("\\b(?:open|launch|start)\\s+(?:google\\s+)?chrome\\b"),
        "chatgpt" to Regex("\\b(?:open|launch|start)\\s+(?:the\\s+)?chat\\s*gpt\\b"),
        "settings" to Regex("\\b(?:open|launch|start)\\s+(?:my\\s+)?settings\\b"),
    )

    private val knownApps = mapOf(
        "maps" to listOf("com.google.android.apps.maps"),
        "gmail" to listOf("com.google.android.gm"),
        "camera" to listOf("com.sec.android.app.camera", "com.google.android.GoogleCamera"),
        "messages" to listOf("com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms"),
        "whatsapp" to listOf("com.whatsapp", "com.whatsapp.w4b"),
        "calendar" to listOf("com.google.android.calendar", "com.samsung.android.calendar"),
        "chrome" to listOf("com.android.chrome"),
        "chatgpt" to listOf("com.openai.chatgpt"),
    )

    fun route(rawTranscript: String): Route? {
        val normalized = rawTranscript
            .lowercase()
            .replace(Regex("[^a-z0-9 ]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
        if (normalized.isBlank() || normalized.length > 240) return null

        val alias = commandPatterns.entries
            .firstOrNull { (_, pattern) -> pattern.containsMatchIn(normalized) }
            ?.key
            ?: return null
        return Route(capabilityId = "app.open_known", alias = alias)
    }

    fun execute(context: Context, route: Route): Execution {
        if (route.capabilityId != "app.open_known") {
            return Execution(false, "unsupported_capability", route.alias)
        }

        if (route.alias == "settings") {
            return try {
                context.startActivity(
                    Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
                Execution(true, "opened", route.alias)
            } catch (_: Exception) {
                Execution(false, "launch_failed", route.alias)
            }
        }

        val candidates = knownApps[route.alias]
            ?: return Execution(false, "unsupported_app_alias", route.alias)
        for (packageName in candidates) {
            val intent = context.packageManager.getLaunchIntentForPackage(packageName) ?: continue
            return try {
                context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                Execution(true, "opened", route.alias)
            } catch (_: Exception) {
                Execution(false, "launch_failed", route.alias)
            }
        }
        return Execution(false, "app_not_installed", route.alias)
    }
}
