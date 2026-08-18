package tech.threedvr.companion

import android.os.Bundle
import android.service.voice.VoiceInteractionService

object CompanionAssistantState {
    @Volatile var serviceReady: Boolean = false
    @Volatile var lastSessionPreparedAt: Long? = null
}

/**
 * Lightweight system-owned entry point for 3DVR as the selected Android assistant.
 * Heavy audio/model work belongs in the session layer rather than this always-on
 * service.
 */
class CompanionVoiceInteractionService : VoiceInteractionService() {
    override fun onReady() {
        super.onReady()
        CompanionAssistantState.serviceReady = true
    }

    override fun onPrepareToShowSession(args: Bundle, flags: Int) {
        CompanionAssistantState.lastSessionPreparedAt = System.currentTimeMillis()
        super.onPrepareToShowSession(args, flags)
    }

    override fun onShutdown() {
        CompanionAssistantState.serviceReady = false
        super.onShutdown()
    }
}
