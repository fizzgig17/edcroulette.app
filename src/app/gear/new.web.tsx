import { Redirect } from 'expo-router';

/** App-only screen: the website sends visitors to the home page instead. */
export default function AppOnly() {
  return <Redirect href="/" />;
}
