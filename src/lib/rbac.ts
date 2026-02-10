export type Role = 'guest' | 'user' | 'admin' | 'developer';

export interface Permission {
  action: string;
  resource: string;
}

const rolePermissions: Record<Role, string[]> = {
  guest: ['read:tools', 'execute:basic_tools'],
  user: ['read:tools', 'execute:basic_tools', 'execute:sensitive_tools', 'read:own_audit'],
  admin: ['*'],
  developer: ['read:tools', 'execute:all_tools', 'write:tools', 'read:all_audit'],
};

export function hasPermission(role: Role, permission: string): boolean {
  const permissions = rolePermissions[role] || [];
  if (permissions.includes('*')) return true;
  return permissions.includes(permission);
}

export function getRoleFromToken(token: string): Role {
  // Mock logic to extract role from JWT or session
  if (token === 'admin-token') return 'admin';
  if (token === 'dev-token') return 'developer';
  return 'user';
}
