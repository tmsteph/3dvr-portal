package tech.threedvr.companion

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.service.voice.VoiceInteractionSession
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Native Android Assistant surface for the first real voice -> capability ->
 * phone-action round trip.
 *
 * Recognition is local to the user-invoked Assistant session. The transcript is
 * routed only through CompanionVoiceCommandRouter's explicit known-app allow
 * list; no arbitrary package, shell, Accessibility selector, or URL is accepted.
 */
class CompanionVoiceInteractionSession(
    private val sessionContext: Context,
) : VoiceInteractionSession(sessionContext) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var speechRecognizer: SpeechRecognizer? = null
    private var statusView: TextView? = null
    private var transcriptView: TextView? = null
    private var listenButton: Button? = null
    private var listening = false

    override fun onCreateContentView(): View {
        val density = sessionContext.resources.displayMetrics.density
        fun dp(value: Int): Int = (value * density).toInt()

        val status = TextView(sessionContext).apply {
            text = "Assistant session ready"
            textSize = 16f
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(8))
        }
        statusView = status

        val transcript = TextView(sessionContext).apply {
            text = "Try: “Open Maps”"
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(16))
        }
        transcriptView = transcript

        val listen = Button(sessionContext).apply {
            text = "Listen"
            setOnClickListener { startListening() }
        }
        listenButton = listen

        return LinearLayout(sessionContext).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(24), dp(24), dp(24))

            addView(TextView(sessionContext).apply {
                text = "3DVR"
                textSize = 26f
                setTypeface(typeface, Typeface.BOLD)
            })
            addView(status)
            addView(transcript)
            addView(listen, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ))
            addView(Button(sessionContext).apply {
                text = "Open 3DVR Companion"
                setOnClickListener { openCompanion() }
            }, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(10) })
        }
    }

    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags)
        CompanionAssistantState.lastSessionPreparedAt = System.currentTimeMillis()
        setKeepAwake(true)
        mainHandler.postDelayed({ startListening() }, 300L)
    }

    override fun onHide() {
        stopListening()
        setKeepAwake(false)
        super.onHide()
    }

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
        speechRecognizer?.destroy()
        speechRecognizer = null
        super.onDestroy()
    }

    private fun startListening() {
        if (listening) return
        if (sessionContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            statusView?.text = "Microphone permission is required"
            transcriptView?.text = "Open 3DVR Companion, allow microphone access, then invoke the Assistant again."
            listenButton?.isEnabled = false
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(sessionContext)) {
            statusView?.text = "Speech recognition is unavailable"
            transcriptView?.text = "Android does not currently expose a recognition service on this device."
            return
        }

        if (speechRecognizer == null) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(sessionContext).also { recognizer ->
                recognizer.setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) {
                        listening = true
                        statusView?.text = "Listening…"
                        listenButton?.isEnabled = false
                    }

                    override fun onBeginningOfSpeech() {
                        statusView?.text = "I hear you…"
                    }

                    override fun onRmsChanged(rmsdB: Float) = Unit
                    override fun onBufferReceived(buffer: ByteArray?) = Unit
                    override fun onEndOfSpeech() {
                        statusView?.text = "Working…"
                    }

                    override fun onError(error: Int) {
                        listening = false
                        listenButton?.isEnabled = true
                        statusView?.text = when (error) {
                            SpeechRecognizer.ERROR_NO_MATCH -> "I didn't catch a supported command"
                            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "I didn't hear anything"
                            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is required"
                            else -> "Speech recognition stopped"
                        }
                        transcriptView?.text = "Try: “Open Maps” or “Open Camera”."
                    }

                    override fun onResults(results: Bundle?) {
                        listening = false
                        listenButton?.isEnabled = true
                        val transcript = results
                            ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            ?.firstOrNull()
                            ?.trim()
                            .orEmpty()
                        handleTranscript(transcript)
                    }

                    override fun onPartialResults(partialResults: Bundle?) {
                        val partial = partialResults
                            ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            ?.firstOrNull()
                            ?.trim()
                            .orEmpty()
                        if (partial.isNotBlank()) transcriptView?.text = "Heard: $partial"
                    }

                    override fun onEvent(eventType: Int, params: Bundle?) = Unit
                })
            }
        }

        statusView?.text = "Starting microphone…"
        transcriptView?.text = "Say: “Open Maps”"
        listenButton?.isEnabled = false
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Tell 3DVR what known app to open")
        }
        try {
            speechRecognizer?.startListening(intent)
        } catch (_: Exception) {
            listening = false
            listenButton?.isEnabled = true
            statusView?.text = "Unable to start speech recognition"
            transcriptView?.text = "Try again, or open Companion to check readiness."
        }
    }

    private fun stopListening() {
        if (!listening) return
        runCatching { speechRecognizer?.cancel() }
        listening = false
        listenButton?.isEnabled = true
    }

    private fun handleTranscript(transcript: String) {
        if (transcript.isBlank()) {
            statusView?.text = "I didn't catch that"
            transcriptView?.text = "Try: “Open Maps”"
            return
        }
        transcriptView?.text = "Heard: $transcript"
        val route = CompanionVoiceCommandRouter.route(transcript)
        if (route == null) {
            CompanionVoiceReceiptStore.record(
                sessionContext,
                transcript = transcript,
                capability = "voice.command",
                target = "",
                ok = false,
                code = "unsupported_voice_command",
            )
            statusView?.text = "That command is outside the safe voice set"
            transcriptView?.text = "Try open Maps, Gmail, Camera, Messages, Calendar, Chrome, ChatGPT, or Settings."
            return
        }

        val execution = CompanionVoiceCommandRouter.execute(sessionContext, route)
        CompanionVoiceReceiptStore.record(
            sessionContext,
            transcript = transcript,
            capability = route.capabilityId,
            target = route.alias,
            ok = execution.ok,
            code = execution.code,
        )
        statusView?.text = if (execution.ok) {
            "Opening ${route.alias.replaceFirstChar { it.uppercase() }}"
        } else {
            "Could not open ${route.alias}: ${execution.code}"
        }
    }

    private fun openCompanion() {
        val intent = sessionContext.packageManager
            .getLaunchIntentForPackage(sessionContext.packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (intent != null) sessionContext.startActivity(intent)
    }
}
