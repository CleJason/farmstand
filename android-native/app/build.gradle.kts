plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// Set by the GitHub Actions build (see .github/workflows/android-native.yml)
val versionCodeProp = (System.getenv("VERSION_CODE") ?: "1").toInt()
val versionNameProp = System.getenv("VERSION_NAME") ?: "0.1-dev"
val keystorePath: String? = System.getenv("KEYSTORE_PATH")

android {
    namespace = "app.farmstand.admin"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.farmstand.admin"
        minSdk = 26
        targetSdk = 35
        versionCode = versionCodeProp
        versionName = versionNameProp
        // Prefilled site address on the sign-in screen (blank = ask)
        buildConfigField("String", "DEFAULT_SITE", "\"${System.getenv("DEFAULT_SITE") ?: ""}\"")
    }

    signingConfigs {
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("KS_PASS")
                keyAlias = System.getenv("KEY_ALIAS") ?: "farmstand"
                keyPassword = System.getenv("KS_PASS")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (keystorePath != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
