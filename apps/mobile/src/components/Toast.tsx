import { Text, View } from "react-native";

export type ToastTone = "default" | "success" | "warning" | "danger";

const TONE_BORDER: Record<ToastTone, string> = {
  default: "border-l-accent",
  success: "border-l-success",
  warning: "border-l-warning",
  danger: "border-l-danger",
};

/** Bottom-anchored, understated, non-blocking — mirrors packages/ui's Toast
 * (web) so "copied" feedback matches across surfaces (design plan §1
 * "consistency over flourish"). Deliberately not `Alert.alert`: a native
 * alert requires a tap to dismiss, which is more interruptive than the
 * design plan's "toast" pattern for something as routine as a copy. */
export function Toast({ message, tone = "default" }: { message: string; tone?: ToastTone }) {
  return (
    <View pointerEvents="none" className="absolute inset-x-5 bottom-8 items-center">
      <View className={`flex-row rounded-xl border-l-2 bg-surface px-4 py-3 ${TONE_BORDER[tone]}`}>
        <Text className="text-sm text-white/95">{message}</Text>
      </View>
    </View>
  );
}
