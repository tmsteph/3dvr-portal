package tech.threedvr.companion

import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Minimal native assistant surface. This establishes the Android assistant/session
 * contract now; realtime speech is connected in the next slice.
 */
class CompanionVoiceInteractionSession(
    private val sessionContext: Context,
) : VoiceInteractionSession(sessionContext) {

    override fun onCreateContentView(): View {
        val density = sessionContext.resources.displayMetrics.density
        fun dp(value: Int): Int = (value * density).toInt()

        return LinearLayout(sessionContext).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(24), dp(24), dp(24))

            addView(TextView(sessionContext).apply {
                text = "3DVR"
                textSize = 26f
                setTypeface(typeface, Typeface.BOLD)
            })
            addView(TextView(sessionContext).apply {
                text = "Assistant session ready"
                textSize = 16f
                setPadding(0, dp(8), 0, dp(16))
            })
            addView(TextView(sessionContext).apply {
                text = "Voice conversation and device tools will run here."
                textSize = 14f
                gravity = Gravity.CENTER
            })
            addView(Button(sessionContext).apply {
                text = "Open 3DVR Companion"
                setOnClickListener {
                    val intent = sessionContext.packageManager
                        .getLaunchIntentForPackage(sessionContext.packageName)
                        ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    if (intent != null) sessionContext.startActivity(intent)
                }
            }, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(16) })
        }
    }

    override fun onShow(args: Bundle?, showFlags: Int) {
        CompanionAssistantState.lastSessionPreparedAt = System.currentTimeMillis()
        setKeepAwake(true)
        super.onShow(args, showFlags)
    }

    override fun onHide() {
        setKeepAwake(false)
        super.onHide()
    }
}
