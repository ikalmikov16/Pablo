import { router } from 'expo-router';

/**
 * Land on the home screen with a clean root stack.
 *
 * `router.replace('/(home)')` pushes a second `(home)` entry when home is
 * already underneath (e.g. home → lobby → game → leave), so the iOS back-swipe
 * revisits home again. `dismissTo` pops back to the existing home instead.
 */
export function navigateHome(): void {
  router.dismissTo('/(home)');
}
