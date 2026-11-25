package app.farmstand.admin.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.farmstand.admin.Api
import app.farmstand.admin.BuildConfig

// "native:x" opens the app's own screen; a path opens that website page inside the app
private val WEB_PAGES = listOf(
    "Products" to "native:products",
    "Customers" to "native:customers",
    "Sales" to "native:sales",
    "Farm stand" to "native:farmstand",
    "Costs" to "/admin/costs",
    "Drop Alerts" to "native:alerts",
    "Bulk Message" to "native:bulk",
    "Discounts" to "native:discounts",
    "Gift Cards" to "native:giftcards",
    "Rewards" to "native:rewards",
    "Reviews" to "native:reviews",
    "Site" to "/admin/site",
    "Settings" to "/admin/settings",
    "View storefront" to "/",
)

@Composable
fun MoreScreen(api: Api, open: (String) -> Unit, onSignOut: () -> Unit) {
    val ctx = LocalContext.current
    LazyColumn(Modifier.fillMaxWidth()) {
        item { ScreenTitle("More") }
        items(WEB_PAGES) { (label, path) ->
            Row(
                Modifier.fillMaxWidth().clickable { open(if (path.startsWith("native:")) path.removePrefix("native:") else "$label|$path") }.padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(label, Modifier.weight(1f))
                Icon(Icons.Filled.ChevronRight, null, tint = Stone)
            }
            HorizontalDivider(Modifier.padding(start = 16.dp))
        }
        item {
            Muted("Signed in as ${api.email} on ${api.site}", Modifier.padding(16.dp))
            OutlinedButton(onClick = onSignOut, modifier = Modifier.padding(horizontal = 16.dp)) { Text("Sign out") }
            Muted("Version ${BuildConfig.VERSION_NAME}", Modifier.padding(16.dp))
        }
    }
}
