package app.farmstand.admin.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Badge
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.farmstand.admin.Api
import app.farmstand.admin.Conversation
import app.farmstand.admin.Thread
import app.farmstand.admin.ago
import app.farmstand.admin.dayTimeText
import app.farmstand.admin.parseInstant
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.net.URLEncoder

fun prettyPhone(p: String): String =
    if (p.length == 10) "(${p.substring(0, 3)}) ${p.substring(3, 6)}-${p.substring(6)}" else p

@Composable
fun MessagesScreen(api: Api, onAuthError: () -> Unit, onUnread: (Int) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var threads by remember { mutableStateOf<List<Thread>?>(null) }
    var open by remember { mutableStateOf<String?>(null) }
    var refreshing by remember { mutableStateOf(false) }

    suspend fun load(quiet: Boolean = false) {
        ctx.attempt(onAuthError, quiet) { api.getAs<List<Thread>>("/api/messages") }?.let { t ->
            threads = t
            onUnread(t.sumOf { it.unread })
        }
    }
    if (open == null) AutoRefresh(Unit, 30_000) { first -> load(quiet = !first) }

    open?.let { phone ->
        BackHandler { open = null }
        ConversationView(api, phone, onAuthError) { open = null }
        return
    }

    Refreshable(refreshing, { scope.launch { refreshing = true; load(); refreshing = false } }) {
        LazyColumn(Modifier.fillMaxSize()) {
            item { ScreenTitle("Messages") }
            val list = threads
            if (list == null) item { Muted("Loading…", Modifier.padding(16.dp)) }
            else if (list.isEmpty()) item { Muted("No texts yet.", Modifier.padding(16.dp)) }
            else items(list, key = { it.phone }) { t ->
                Row(
                    Modifier.fillMaxWidth().clickable { open = t.phone }.padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(t.name ?: prettyPhone(t.phone), fontWeight = if (t.unread > 0) FontWeight.Bold else FontWeight.Medium)
                        Text(
                            (if (t.last.direction == "OUT") "You: " else "") + t.last.body,
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Muted(parseInstant(t.last.createdAt)?.let { ago(it) } ?: "")
                        if (t.unread > 0) Badge { Text("${t.unread}") }
                    }
                }
                HorizontalDivider(Modifier.padding(start = 16.dp))
            }
        }
    }
}

@Composable
private fun ConversationView(api: Api, phone: String, onAuthError: () -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var convo by remember { mutableStateOf<Conversation?>(null) }
    var draft by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    suspend fun load(quiet: Boolean = false) {
        ctx.attempt(onAuthError, quiet) { api.getAs<Conversation>("/api/messages?phone=${URLEncoder.encode(phone, "UTF-8")}") }?.let { convo = it }
    }
    AutoRefresh(phone, 15_000) { first -> load(quiet = !first) }
    LaunchedEffect(convo?.messages?.size) {
        val n = convo?.messages?.size ?: 0
        if (n > 0) listState.scrollToItem(n - 1)
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Back") }
            Column(Modifier.weight(1f)) {
                Text(convo?.name ?: prettyPhone(phone), fontWeight = FontWeight.Bold)
                if (convo?.name != null) Muted(prettyPhone(phone))
            }
            IconButton(onClick = { ctx.call(phone) }) { Icon(Icons.Filled.Call, "Call") }
        }
        HorizontalDivider()
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = listState, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(convo?.messages.orEmpty(), key = { it.id }) { m ->
                val mine = m.direction == "OUT"
                Box(Modifier.fillMaxWidth().padding(horizontal = 12.dp), contentAlignment = if (mine) Alignment.CenterEnd else Alignment.CenterStart) {
                    Column(horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
                        Text(
                            m.body,
                            Modifier.widthIn(max = 290.dp)
                                .background(
                                    if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                                    RoundedCornerShape(16.dp),
                                )
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            color = if (mine) Color.White else MaterialTheme.colorScheme.onSurface,
                        )
                        Muted(parseInstant(m.createdAt)?.dayTimeText() ?: "")
                    }
                }
            }
        }
        if (convo?.optedOut == true) {
            Muted("They replied STOP, so they can't be texted unless they reply START.", Modifier.padding(12.dp))
        } else {
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(draft, { draft = it }, Modifier.weight(1f), placeholder = { Text("Text message") }, maxLines = 5)
                IconButton(
                    enabled = !sending && draft.isNotBlank(),
                    onClick = {
                        sending = true
                        scope.launch {
                            ctx.attempt(onAuthError) {
                                api.post("/api/messages", buildJsonObject { put("phone", phone); put("body", draft) })
                            }?.let {
                                draft = ""
                                load()
                            }
                            sending = false
                        }
                    },
                ) { Icon(Icons.Filled.Send, "Send") }
            }
        }
    }
}
