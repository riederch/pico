/** Raw local paths, socket errors and parser details never cross into IPC. */
export function picoCompanionPublicServiceErrorReason(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('unreadable_companion_profile:')) {
    return 'companion_profile_unavailable';
  }
  if (message.includes('companion_profile')
    || message.startsWith('invalid_')
    || message.startsWith('missing_')
    || message.startsWith('unexpected_')) {
    return 'companion_profile_invalid';
  }
  if (message.includes('ENOENT')
    || message.includes('ECONNREFUSED')
    || message.includes('daemon_connection')) {
    return 'pico_vault_unavailable';
  }
  return 'companion_service_unavailable';
}
