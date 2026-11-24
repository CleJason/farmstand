package app.farmstand.admin.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Amber = Color(0xFFD97706)
val AmberDark = Color(0xFFB45309)
val Green = Color(0xFF059669)
val Blue = Color(0xFF2563EB)
val Red = Color(0xFFDC2626)
val Stone = Color(0xFF78716C)

private val Light = lightColorScheme(
    primary = Amber,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFEF3C7),
    onPrimaryContainer = Color(0xFF78350F),
    secondary = Color(0xFF44403C),
    background = Color(0xFFFAFAF8),
    surface = Color(0xFFFAFAF8),
    surfaceVariant = Color(0xFFF5F5F4),
    surfaceContainer = Color(0xFFF5F5F4),
    surfaceContainerLow = Color.White,
    onSurfaceVariant = Color(0xFF57534E),
    outlineVariant = Color(0xFFE7E5E4),
)

private val Dark = darkColorScheme(
    primary = Color(0xFFF59E0B),
    onPrimary = Color(0xFF1C1917),
    primaryContainer = Color(0xFF78350F),
    onPrimaryContainer = Color(0xFFFEF3C7),
    background = Color(0xFF1C1917),
    surface = Color(0xFF1C1917),
    surfaceVariant = Color(0xFF292524),
    surfaceContainer = Color(0xFF292524),
    surfaceContainerLow = Color(0xFF231F1D),
    onSurfaceVariant = Color(0xFFA8A29E),
    outlineVariant = Color(0xFF44403C),
)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
}
