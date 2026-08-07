// MUST be the first import — react-native-get-random-values polyfills
// `crypto.getRandomValues`, which core-domain's password generator (and
// core-crypto transitively) needs and Hermes doesn't provide natively.
import "react-native-get-random-values";
import { registerRootComponent } from "expo";
import App from "./App.js";

registerRootComponent(App);
