plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.atheer.newsradio"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.atheer.newsradio"
        minSdk = 24
        targetSdk = 35
        versionCode = 4
        versionName = "1.3.0"
        buildConfigField("String", "REMOTE_APP_URL", "\"https://ais-pre-hlgzdybqjmsccfgh7yzoxc-70433494319.europe-west2.run.app\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
}
