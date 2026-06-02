import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

const RC_API_KEY_IOS = 'REPLACE_WITH_IOS_KEY';
const RC_API_KEY_ANDROID = 'REPLACE_WITH_ANDROID_KEY';

export function initRevenueCat(userId?: string) {
  Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  const apiKey = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
  Purchases.configure({ apiKey, appUserID: userId });
}

export async function getOfferings() {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch (e) {
    console.error('RevenueCat getOfferings error:', e);
    return null;
  }
}

export async function purchasePackage(pkg: any) {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  } catch (e) {
    console.error('RevenueCat purchase error:', e);
    throw e;
  }
}

export async function getCustomerInfo() {
  try {
    return await Purchases.getCustomerInfo();
  } catch (e) {
    console.error('RevenueCat customerInfo error:', e);
    return null;
  }
}
