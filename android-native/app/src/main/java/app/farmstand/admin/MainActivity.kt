package app.farmstand.admin

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.ListAlt
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.core.content.ContextCompat
import app.farmstand.admin.ui.AppTheme
import app.farmstand.admin.ui.DropsScreen
import app.farmstand.admin.ui.LoginScreen
import app.farmstand.admin.ui.MessagesScreen
import app.farmstand.admin.ui.MoreScreen
import app.farmstand.admin.ui.OrdersScreen
import app.farmstand.admin.ui.TodayScreen
import app.farmstand.admin.ui.WebPage

enum class Tab(val label: String, val icon: ImageVector) {
    Today("Today", Icons.Filled.WbSunny),
    Orders("Orders", Icons.Filled.ListAlt),
    Messages("Messages", Icons.Filled.Chat),
    Drops("Drops", Icons.Filled.CalendarMonth),
    More("More", Icons.Filled.MoreHoriz),
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val api = Api(applicationContext)
        val startTab = intent.getStringExtra("tab")
        setContent {
            AppTheme {
                // Paint the theme's background so text is readable in light and dark mode
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    App(api, startTab, onSignedIn = { askForNotifications() })
                }
            }
        }
    }

    private fun askForNotifications() {
        CheckWorker.schedule(applicationContext)
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }
}

@Composable
fun App(api: Api, startTab: String?, onSignedIn: () -> Unit) {
    // null = checking, false = show sign-in
    var signedIn by remember { mutableStateOf<Boolean?>(null) }
    var tab by rememberSaveable { mutableStateOf(Tab.entries.firstOrNull { it.name == startTab } ?: Tab.Today) }
    var unread by remember { mutableIntStateOf(0) }
    var web by remember { mutableStateOf<Pair<String, String>?>(null) }
    val openWeb = { title: String, path: String -> web = title to path }
    val signOut = {
        api.signOut()
        CheckWorker.cancel(api.appContext)
        signedIn = false
    }

    LaunchedEffect(Unit) {
        signedIn = api.site.isNotBlank() && api.isAdmin()
        if (signedIn == true) onSignedIn()
    }

    when (signedIn) {
        null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        false -> LoginScreen(api) {
            signedIn = true
            onSignedIn()
        }
        true -> web?.let { (title, path) ->
            WebPage(api, title, path) { web = null }
        } ?: run {
            BackHandler(enabled = tab != Tab.Today) { tab = Tab.Today }
            Scaffold(
                bottomBar = {
                    NavigationBar {
                        Tab.entries.forEach { t ->
                            NavigationBarItem(
                                selected = tab == t,
                                onClick = { tab = t },
                                icon = {
                                    if (t == Tab.Messages && unread > 0) {
                                        BadgedBox(badge = { Badge { Text("$unread") } }) { Icon(t.icon, t.label) }
                                    } else {
                                        Icon(t.icon, t.label)
                                    }
                                },
                                label = { Text(t.label) },
                            )
                        }
                    }
                },
            ) { pad ->
                Box(Modifier.padding(pad)) {
                    val onAuthError = { signOut() }
                    when (tab) {
                        Tab.Today -> TodayScreen(api, onAuthError, onUnread = { unread = it }, goTo = { tab = it })
                        Tab.Orders -> OrdersScreen(api, onAuthError)
                        Tab.Messages -> MessagesScreen(api, onAuthError, onUnread = { unread = it })
                        Tab.Drops -> DropsScreen(api, onAuthError, openWeb)
                        Tab.More -> MoreScreen(api, openWeb, onSignOut = signOut)
                    }
                }
            }
        }
    }
}
