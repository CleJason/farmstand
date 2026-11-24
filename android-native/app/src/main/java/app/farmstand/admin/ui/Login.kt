package app.farmstand.admin.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.farmstand.admin.Api
import app.farmstand.admin.ApiException
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(api: Api, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var site by remember { mutableStateOf(api.site) }
    var email by remember { mutableStateOf(api.email) }
    var code by remember { mutableStateOf("") }
    var sent by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun run(block: suspend () -> Unit) {
        busy = true
        error = null
        scope.launch {
            try {
                block()
            } catch (e: ApiException) {
                error = e.message
            } catch (e: Exception) {
                error = "Something went wrong. Try again."
            }
            busy = false
        }
    }

    Column(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Spacer(Modifier.height(40.dp))
        Text("Shop Admin", fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Text(
            if (sent) "We emailed a 6-digit code to $email." else "Sign in with your admin email. We'll email you a code.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!sent) {
            OutlinedTextField(
                value = site,
                onValueChange = { site = it },
                label = { Text("Shop website") },
                placeholder = { Text("shop.example.com") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = {
                    run {
                        api.site = site.trim()
                        api.sendCode(email)
                        sent = true
                    }
                },
                enabled = !busy && site.isNotBlank() && email.contains("@"),
                modifier = Modifier.fillMaxWidth().height(50.dp),
            ) { Text(if (busy) "Sending…" else "Email me a code") }
        } else {
            OutlinedTextField(
                value = code,
                onValueChange = { v -> code = v.filter { it.isDigit() }.take(6) },
                label = { Text("6-digit code") },
                singleLine = true,
                textStyle = MaterialTheme.typography.headlineSmall.copy(textAlign = TextAlign.Center, letterSpacing = 6.sp),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = { run { api.verifyCode(email, code); onDone() } },
                enabled = !busy && code.length == 6,
                modifier = Modifier.fillMaxWidth().height(50.dp),
            ) { Text(if (busy) "Checking…" else "Sign in") }
            TextButton(onClick = { sent = false; code = ""; error = null }) { Text("Use a different email or resend") }
            Text(
                "Not there? Check spam. The code expires in 1 hour.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}
