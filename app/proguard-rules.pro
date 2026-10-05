# Add project specific ProGuard rules here.
-keepclassmembers class * {
    @androidx.annotation.Keep <fields>;
    @androidx.annotation.Keep <methods>;
}
-keep class com.dealfilter.vitaminshoppe.data.model.** { *; }
