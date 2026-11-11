# Add project specific ProGuard rules here.
# Keep Capacitor native bridge classes and JS-exposed @PluginMethod annotations intact on release minify.
-keepattributes *Annotation*,Signature,SourceFile,LineNumberTable
-keep class org.lanterned.app.** { *; }
-keepclassmembers class org.lanterned.app.** {
    @com.getcapacitor.PluginMethod public *;
}
