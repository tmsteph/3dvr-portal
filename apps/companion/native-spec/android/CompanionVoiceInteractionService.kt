package tech.threedvr.companion

import android.os.Bundle
import android.service.voice.VoiceInteractionService

/**
 * Lightweight system-owned entry point for 3DVR as the selected Android assistant.
 * Heavy audio/model work belongs in the session layer rather than this always-on
 * service.
 */
class CompanionVoiceInteractionService : VoiceInteractionService() {
    override fun onReady() {
        super.onReady()
        CompanionAssistantStateStore.setServiceReady(this, true)
    }

    override fun onPrepareToShowSession(args: Bundle, flags: Int) {
        CompanionAssistantStateStore.markSessionPrepared(this)
        super.onPrepareToShowSession(args, flags)
    }

    override fun onShutdown() {
        CompanionAssistantStateStore.setServiceReady(this, false)
        super.onShutdown()
    }
}
