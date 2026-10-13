import java.text.SimpleDateFormat
import java.util.Date
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Private settings live in local.properties, which is never committed, zipped or uploaded:
//   github.repo / github.token  - the owner build publishes the list to GitHub Pages
//   share.url / share.token     - ...or to the owner's own server (token falls back to web/data/config.json)
//   release.storeFile, release.storePassword, release.keyAlias, release.keyPassword - signing key
val localProps = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
val ownerShareUrl: String = localProps.getProperty("share.url", "").takeIf { !it.contains("github.com") } ?: ""
val ownerShareToken: String = if (ownerShareUrl.isBlank()) "" else localProps.getProperty("share.token")
    ?: rootProject.file("web/data/config.json").takeIf { it.exists() }?.readText()
        ?.let { Regex("\"token\"\\s*:\\s*\"([^\"]+)\"").find(it)?.groupValues?.get(1) }
    ?: ""
val ownerGitHubRepo: String = localProps.getProperty("github.repo", "")
val ownerGitHubToken: String = localProps.getProperty("github.token", "")
fun quoted(v: String) = "\"" + v.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

// versionName is kept in version.properties (bumped by scripts/release.mjs); versionCode is
// date-based (yyMMddHH + tens of minutes, e.g. 261013173) so every build is newer than the last, or set exactly with -PversionCode=.
val versionProps = Properties().apply {
    rootProject.file("version.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
val appVersionName: String = versionProps.getProperty("versionName", "3.0.0")
val appVersionCode: Int = (project.findProperty("versionCode") as String?)?.toInt()
    ?: Date().let { (SimpleDateFormat("yyMMddHH").format(it) + SimpleDateFormat("mm").format(it).toInt() / 10).toInt() }
val releaseStore: File? = localProps.getProperty("release.storeFile")?.let { file(it) }?.takeIf { it.exists() }

android {
    namespace = "com.dealfilter.vitaminshoppe"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.dealfilter.vitaminshoppe"
        minSdk = 26
        targetSdk = 34
        versionCode = appVersionCode
        versionName = appVersionName

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    flavorDimensions += "audience"
    productFlavors {
        // Your phone: syncs to your server by default.
        create("owner") {
            dimension = "audience"
            buildConfigField("String", "SHARE_URL", quoted(ownerShareUrl))
            buildConfigField("String", "SHARE_TOKEN", quoted(ownerShareToken))
            buildConfigField("String", "GITHUB_REPO", quoted(ownerGitHubRepo))
            buildConfigField("String", "GITHUB_TOKEN", quoted(ownerGitHubToken))
        }
        // What the share page hands out: no server or token baked in; sharing starts off.
        create("everyone") {
            dimension = "audience"
            buildConfigField("String", "SHARE_URL", "\"\"")
            buildConfigField("String", "SHARE_TOKEN", "\"\"")
            buildConfigField("String", "GITHUB_REPO", "\"\"")
            buildConfigField("String", "GITHUB_TOKEN", "\"\"")
        }
    }

    // In-app updates only install over an app signed with the same key, so every build made here
    // (debug included) uses the one release key. Someone building from the source without it gets
    // the standard debug key instead.
    signingConfigs {
        if (releaseStore != null) {
            create("release") {
                storeFile = releaseStore
                storePassword = localProps.getProperty("release.storePassword")
                keyAlias = localProps.getProperty("release.keyAlias")
                keyPassword = localProps.getProperty("release.keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
        release {
            signingConfigs.findByName("release")?.let { signingConfig = it }
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.11"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
        // Robolectric + Roborazzi render real Compose screens to PNG in local tests.
        unitTests.isIncludeAndroidResources = true
        unitTests.all {
            it.systemProperty("roborazzi.test.record", "true")
            it.systemProperty("robolectric.pixelCopyRenderMode", "hardware")
            it.maxHeapSize = "2g"
        }
    }
}

dependencies {
    // AndroidX & Lifecycle
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.7.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.activity:activity-compose:1.8.2")

    // Jetpack Compose BOM & UI
    implementation(platform("androidx.compose:compose-bom:2024.04.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")

    // Opens product pages in a Custom Tab (shares the user's browser session and cart)
    implementation("androidx.browser:browser:1.8.0")
    // Origin-restricted JS bridge (WebMessageListener) for the hidden WebView
    implementation("androidx.webkit:webkit:1.10.0")

    // Coil Image Loading for Compose
    implementation("io.coil-kt:coil-compose:2.6.0")

    // Unit Testing
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.0")
    // Android's org.json is a stub in local unit tests; use the real implementation there.
    testImplementation("org.json:json:20240303")
    testImplementation("org.robolectric:robolectric:4.12.2")
    testImplementation("io.github.takahirom.roborazzi:roborazzi:1.13.0")
    testImplementation("io.github.takahirom.roborazzi:roborazzi-compose:1.13.0")
    testImplementation(platform("androidx.compose:compose-bom:2024.04.01"))
    testImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.04.01"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
