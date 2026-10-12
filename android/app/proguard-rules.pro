# Hesabu — R8/ProGuard keep rules (minification is off for the sprint build; these apply once it is on).

# kotlinx.serialization: keep serializers and the companion lookups.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class ke.hesabu.app.**$$serializer { *; }
-keepclassmembers class ke.hesabu.app.** { *** Companion; }
-keepclasseswithmembers class ke.hesabu.app.** { kotlinx.serialization.KSerializer serializer(...); }

# SQLCipher loads its native library by name.
-keep class net.zetetic.database.** { *; }
