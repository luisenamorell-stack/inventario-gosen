import React, { useState } from 'react';
import { UserAccount, StoreSettings, ActiveTab, UserRole } from '../types';
import {
  Users,
  UserPlus,
  ShieldCheck,
  User,
  Key,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  Save,
  X,
  Lock,
  Boxes,
  ShoppingCart,
  List,
  FileText,
  ClipboardCheck,
  Tag,
  Truck,
  Store,
  Globe,
  Activity,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';

interface UserManagementViewProps {
  users: UserAccount[];
  storeSettings: StoreSettings;
  onSaveUser: (user: UserAccount) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const TAB_MODULES: { id: ActiveTab; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  {
    id: 'sales',
    label: 'Ventas y Facturación (POS)',
    description: 'Permite cobrar, generar facturas/tickets y registrar ventas',
    icon: ShoppingCart,
  },
  {
    id: 'inventory',
    label: 'Control de Inventario',
    description: 'Permite consultar lista de artículos y stock en tienda',
    icon: List,
  },
  {
    id: 'price-checker',
    label: 'Consultar Precio',
    description: 'Terminal rápida de consulta de precios con escáner',
    icon: Tag,
  },
  {
    id: 'catalog',
    label: 'Catálogo Digital',
    description: 'Acceso a enlace del catálogo online de la tienda',
    icon: Globe,
  },
  {
    id: 'purchases',
    label: 'Compras e Ingresos',
    description: 'Permite ingresar facturas de compra de proveedores',
    icon: FileText,
  },
  {
    id: 'audit',
    label: 'Conteo y Auditoría de Stock',
    description: 'Permite realizar conteo físico de inventario',
    icon: ClipboardCheck,
  },
  {
    id: 'suppliers',
    label: 'Directorio de Proveedores',
    description: 'Consulta datos de contacto de proveedores',
    icon: Truck,
  },
  {
    id: 'dashboard',
    label: 'Panel de Control (Dashboard)',
    description: 'Vista general con indicadores financieros',
    icon: Boxes,
  },
  {
    id: 'activity',
    label: 'Registro de Movimientos',
    description: 'Permite auditar acciones realizadas por el personal',
    icon: Activity,
  },
];

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  users,
  storeSettings,
  onSaveUser,
  onDeleteUser,
  showToast,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>('collaborator');
  const [isActive, setIsActive] = useState(true);
  const [allowedTabs, setAllowedTabs] = useState<ActiveTab[]>([
    'sales',
    'inventory',
    'price-checker',
    'catalog',
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);

  const handleOpenNewUser = () => {
    setEditingUser(null);
    setName('');
    setUsername('');
    setPassword('');
    setRole('collaborator');
    setIsActive(true);
    setAllowedTabs(['sales', 'inventory', 'price-checker', 'catalog']);
    setIsModalOpen(true);
  };

  const handleOpenEditUser = (user: UserAccount) => {
    setEditingUser(user);
    setName(user.name);
    setUsername(user.username);
    setPassword(user.password);
    setRole(user.role);
    setIsActive(user.isActive);
    setAllowedTabs(user.allowedTabs || ['sales', 'inventory', 'price-checker']);
    setIsModalOpen(true);
  };

  const handleToggleTabPermission = (tabId: ActiveTab) => {
    if (allowedTabs.includes(tabId)) {
      setAllowedTabs(allowedTabs.filter((t) => t !== tabId));
    } else {
      setAllowedTabs([...allowedTabs, tabId]);
    }
  };

  const handleSelectAllTabs = () => {
    setAllowedTabs(TAB_MODULES.map((t) => t.id));
  };

  const handleDeselectAllTabs = () => {
    setAllowedTabs(['sales', 'price-checker']);
  };

  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Ingresa el nombre del colaborador.', 'error');
      return;
    }
    if (!username.trim()) {
      showToast('Ingresa un usuario para iniciar sesión.', 'error');
      return;
    }
    if (!password.trim()) {
      showToast('Ingresa la contraseña de acceso.', 'error');
      return;
    }
    if (role === 'collaborator' && allowedTabs.length === 0) {
      showToast('Selecciona al menos un módulo habilitado para el colaborador.', 'error');
      return;
    }

    // Check duplicate username
    const cleanUsername = username.trim().toLowerCase();
    const existing = users.find(
      (u) => u.username.toLowerCase() === cleanUsername && u.id !== editingUser?.id
    );
    if (existing) {
      showToast(`El usuario "${cleanUsername}" ya existe. Elige otro nombre de usuario.`, 'error');
      return;
    }

    setIsSaving(true);
    try {
      const userPayload: UserAccount = {
        id: editingUser ? editingUser.id : `usr_${Date.now()}`,
        name: name.trim(),
        username: cleanUsername,
        password: password.trim(),
        role,
        isActive,
        allowedTabs: role === 'admin' ? TAB_MODULES.map((t) => t.id) : allowedTabs,
        createdAt: editingUser ? editingUser.createdAt : Date.now(),
      };

      await onSaveUser(userPayload);
      showToast(
        editingUser
          ? `Colaborador "${userPayload.name}" actualizado con éxito.`
          : `Colaborador "${userPayload.name}" registrado correctamente.`,
        'success'
      );
      setIsModalOpen(false);
    } catch (error) {
      showToast('Error al guardar datos del usuario.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    try {
      await onDeleteUser(userToDelete.id);
      showToast(`Usuario "${userToDelete.name}" eliminado correctamente.`, 'info');
      setUserToDelete(null);
    } catch (error) {
      showToast('Error al eliminar usuario.', 'error');
    }
  };

  return (
    <div className="flex-1 min-h-0 h-full w-full bg-slate-50 overflow-y-auto scroll-container p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 pb-36 md:pb-24">
      {/* Header Banner */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0 border border-emerald-200">
            <Users className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight leading-snug">
              Gestión de Usuarios y Colaboradores
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
              Crea perfiles para tus empleados, asigna contraseñas y limita el acceso únicamente a los módulos autorizados.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenNewUser}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0 active:scale-95"
        >
          <UserPlus className="w-4 h-4 shrink-0" />
          <span>Crear Nuevo Colaborador</span>
        </button>
      </div>

      {/* Admin Credentials Info Card */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Usuario Administrador Principal
            </div>
            <div className="font-extrabold text-sm text-white mt-0.5">
              Acceso Máximo al Sistema
            </div>
            <div className="text-xs text-slate-300 font-mono mt-0.5">
              Contraseña Master Configurada: <span className="font-black text-amber-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">{storeSettings.accessPassword || 'GOSEN2026'}</span>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-400 bg-slate-800/80 p-3 rounded-xl border border-slate-700/80 max-w-md">
          💡 Puedes cambiar la contraseña master de Administrador en la pestaña <strong className="text-white font-bold">Ajustes Tienda</strong>.
        </div>
      </div>

      {/* Users List Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span>Lista de Colaboradores Registrados ({users.length})</span>
          </h2>
        </div>

        {users.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
            <Users className="w-12 h-12 text-slate-300 mx-auto stroke-1" />
            <div className="font-bold text-slate-800 text-base">No hay colaboradores registrados aún</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Presiona el botón "Crear Nuevo Colaborador" para otorgar credenciales y permisos específicos a tus cajeros o empleados.
            </p>
            <button
              onClick={handleOpenNewUser}
              className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Registrar Primer Colaborador</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map((u) => {
              const isUserActive = u.isActive !== false;
              const allowedTabsCount = u.allowedTabs?.length || 0;

              return (
                <div
                  key={u.id}
                  className={`bg-white p-5 rounded-2xl border transition-all shadow-xs flex flex-col justify-between space-y-4 ${
                    isUserActive
                      ? 'border-slate-200 hover:border-emerald-300 hover:shadow-md'
                      : 'border-slate-200/80 bg-slate-50/60 opacity-80'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                            u.role === 'admin'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          <User className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-black text-slate-900 text-sm truncate">{u.name}</h3>
                          <span className="font-mono text-xs text-slate-500 block truncate">
                            @{u.username}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${
                          isUserActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {isUserActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-100 font-mono">
                        <span className="text-slate-400 font-sans">Contraseña:</span>
                        <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {u.password}
                        </span>
                      </div>

                      <div className="text-slate-600 space-y-1">
                        <div className="font-bold text-[11px] uppercase tracking-wider text-slate-400">
                          Módulos Habilitados ({allowedTabsCount}):
                        </div>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {u.allowedTabs && u.allowedTabs.length > 0 ? (
                            u.allowedTabs.map((tabKey) => {
                              const moduleDef = TAB_MODULES.find((tm) => tm.id === tabKey);
                              return (
                                <span
                                  key={tabKey}
                                  className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-lg text-[10px] font-bold"
                                >
                                  {moduleDef?.label.split(' ')[0] || tabKey}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-rose-500 font-medium">Sin permisos asignados</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditUser(u)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                      <span>Editar / Permisos</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setUserToDelete(u)}
                      className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors cursor-pointer"
                      title="Eliminar usuario"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Form: Create / Edit Collaborator */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90dvh] animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="p-3.5 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold shrink-0">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-sm sm:text-lg text-white truncate">
                    {editingUser ? 'Editar Colaborador y Permisos' : 'Crear Nuevo Colaborador'}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-300 truncate">
                    Define credenciales y módulos autorizados para este usuario.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitUser} className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto scroll-container p-4 sm:p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                      Nombre Completo del Empleado <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="ej. Carlos López"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                      Nombre de Usuario (Para Login) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="ej. carlos2"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                      Contraseña de Acceso / PIN <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="ej. 1234 o clave"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-3.5 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                      Estado de la Cuenta
                    </label>
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsActive(true)}
                        className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                          isActive
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Activo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsActive(false)}
                        className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                          !isActive
                            ? 'bg-rose-50 border-rose-500 text-rose-800 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <XCircle className="w-4 h-4 text-rose-600" />
                        <span>Bloqueado</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Module Permissions Checkboxes */}
                <div className="space-y-3 pt-3 border-t border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <label className="block font-black text-slate-900 text-xs sm:text-sm uppercase tracking-wide">
                        Permisos de Acceso a Pestañas y Módulos
                      </label>
                      <p className="text-xs text-slate-500">
                        Marca únicamente los paneles que este colaborador podrá abrir en la barra lateral.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-bold">
                      <button
                        type="button"
                        onClick={handleSelectAllTabs}
                        className="text-emerald-700 hover:underline cursor-pointer"
                      >
                        Marcar Todos
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={handleDeselectAllTabs}
                        className="text-slate-500 hover:underline cursor-pointer"
                      >
                        Solo Ventas
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {TAB_MODULES.map((mod) => {
                      const Icon = mod.icon;
                      const isChecked = allowedTabs.includes(mod.id);

                      return (
                        <label
                          key={mod.id}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                            isChecked
                              ? 'bg-emerald-50/70 border-emerald-400 text-slate-900 shadow-2xs'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleTabPermission(mod.id)}
                            className="mt-1 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer shrink-0"
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 font-extrabold text-xs text-slate-900">
                              <Icon className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span className="truncate">{mod.label}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5">
                              {mod.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Sticky Submit Buttons Footer */}
              <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <Save className="w-4 h-4 shrink-0" />
                  <span>{editingUser ? 'Guardar Cambios' : 'Registrar Colaborador'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl p-6 space-y-4 border border-slate-200 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-lg text-slate-900">¿Eliminar Colaborador?</h3>
              <p className="text-xs text-slate-500">
                ¿Estás seguro de eliminar el perfil de <strong className="text-slate-800">{userToDelete.name}</strong> (@{userToDelete.username})? Ya no podrá ingresar al sistema.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
