import type { AuthContext } from './auth';

export const ROLE_HIERARCHY = {
  qoa_admin: 100,
  qoa_support: 90,
  cpg_admin: 50,
  store_admin: 40,
  store_staff: 30,
  customer: 10,
  consumer: 1,
} as const;

export type Role = keyof typeof ROLE_HIERARCHY;

/** Roles con acceso global (sin restricción de tenant) */
export const GLOBAL_ROLES: Role[] = ['qoa_admin', 'qoa_support'];

/** Roles de backoffice Qoa */
export const BACKOFFICE_ROLES: Role[] = ['qoa_admin', 'qoa_support'];

/** Roles que solo pueden leer (no modificar) */
export const READ_ONLY_ROLES: Role[] = ['qoa_support'];

/**
 * Verifica si el contexto de auth es de tipo usuario (JWT o dev)
 */
const isUserAuth = (auth: AuthContext): auth is Extract<AuthContext, { type: 'jwt' | 'dev' }> => {
  return auth.type === 'jwt' || auth.type === 'dev';
};

/**
 * Verifica si el usuario puede acceder a un recurso de un tenant específico
 */
export const canAccessTenant = (
  auth: AuthContext,
  targetTenantId: string,
  targetTenantType: 'cpg' | 'store',
): boolean => {
  // API Keys siempre están limitadas a su tenant
  if (!isUserAuth(auth)) {
    return auth.tenantId === targetTenantId && auth.tenantType === targetTenantType;
  }

  // Roles globales pueden acceder a todo
  if (GLOBAL_ROLES.includes(auth.role as Role)) {
    return true;
  }

  // Otros roles solo pueden acceder a su propio tenant
  return auth.tenantId === targetTenantId && auth.tenantType === targetTenantType;
};

/**
 * Verifica si el usuario puede modificar recursos (no es rol de solo lectura)
 */
export const canModify = (auth: AuthContext): boolean => {
  // API Keys tienen permisos según sus scopes
  if (!isUserAuth(auth)) {
    return true;
  }

  return !READ_ONLY_ROLES.includes(auth.role as Role);
};

/**
 * Verifica si el usuario tiene un rol global (acceso a todos los tenants)
 */
export const hasGlobalAccess = (auth: AuthContext): boolean => {
  if (!isUserAuth(auth)) {
    return false;
  }

  return GLOBAL_ROLES.includes(auth.role as Role);
};

export type TenantFilter = {
  tenantId: string;
  tenantType: 'cpg' | 'store';
} | null;

/**
 * Obtiene el filtro de tenant para queries.
 * Retorna null si el usuario tiene acceso global.
 */
export const getTenantFilter = (auth: AuthContext): TenantFilter => {
  // API Keys siempre filtran por su tenant
  if (!isUserAuth(auth)) {
    return { tenantId: auth.tenantId, tenantType: auth.tenantType };
  }

  // Roles globales no tienen filtro
  if (GLOBAL_ROLES.includes(auth.role as Role)) {
    return null;
  }

  // Roles con tenant retornan su filtro
  if (auth.tenantId && auth.tenantType) {
    return { tenantId: auth.tenantId, tenantType: auth.tenantType };
  }

  // Consumidores y otros roles sin tenant
  return null;
};

/**
 * Verifica si el rol del usuario tiene al menos el nivel de jerarquía especificado
 */
export const hasMinimumRole = (auth: AuthContext, minimumRole: Role): boolean => {
  if (!isUserAuth(auth)) {
    return false;
  }

  const userLevel = ROLE_HIERARCHY[auth.role as Role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minimumRole];

  return userLevel >= requiredLevel;
};
