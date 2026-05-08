/**
 * Activity logging for debugging and monitoring
 */
export async function logActivity(action, details) {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${action}:`, JSON.stringify(details));
  } catch (error) {
    console.error('Logging error:', error);
  }
}
