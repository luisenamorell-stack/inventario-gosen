import React, { useState } from 'react';
import { Supplier, Product } from '../types';
import {
  Plus,
  Search,
  Building,
  Phone,
  Mail,
  Pencil,
  Trash2,
  X,
  Save,
  Package
} from 'lucide-react';

import { ConfirmDialog } from './ConfirmDialog';

interface SuppliersViewProps {
  suppliers: Supplier[];
  inventory: Product[];
  onSaveSupplier: (supplier: Supplier, oldName?: string) => void;
  onDeleteSupplier: (id: string) => void;
  showModalInitially?: boolean;
  onCloseInitialModal?: () => void;
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({
  suppliers,
  inventory,
  onSaveSupplier,
  onDeleteSupplier,
  showModalInitially = false,
  onCloseInitialModal,
}) => {
  const [searchText, setSearchText] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(showModalInitially);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);

  // Form State
  const [formData, setFormData] = useState<Supplier>({
    id: '',
    name: '',
    contact: '',
    phone: '',
    email: '',
    address: '',
  });

  const handleOpenCreate = () => {
    setEditingSupplier(null);
    setFormData({
      id: '',
      name: '',
      contact: '',
      phone: '',
      email: '',
      address: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (sup: Supplier) => {
    setEditingSupplier(sup);
    setFormData({ ...sup });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSupplier(null);
    if (onCloseInitialModal) onCloseInitialModal();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const supplierToSave: Supplier = {
      id: editingSupplier ? editingSupplier.id : Date.now().toString(),
      name: formData.name.trim(),
      contact: formData.contact?.trim() || '',
      phone: formData.phone?.trim() || '',
      email: formData.email?.trim() || '',
      address: formData.address?.trim() || '',
    };

    onSaveSupplier(supplierToSave, editingSupplier?.name);
    handleCloseModal();
  };

  // Filter suppliers
  const filteredSuppliers = suppliers.filter((s) => {
    const q = searchText.toLowerCase().trim();
    return (
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.contact && s.contact.toLowerCase().includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q)) ||
      (s.phone && s.phone.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex-1 flex flex-col p-4 lg:p-6 h-full w-full bg-slate-50">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Directorio de Proveedores</h1>
          <p className="text-sm text-slate-500">
            Gestiona la información de contacto de las empresas y distribuidores.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Proveedor</span>
        </button>
      </header>

      {/* Main card */}
      <div className="bg-white flex-1 rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
        {/* Search bar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <div className="flex max-w-md bg-white rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
            <span className="p-3 text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Buscar por nombre, contacto o correo..."
              className="py-2.5 pr-4 outline-none w-full text-sm bg-transparent"
            />
          </div>
        </div>

        {/* Suppliers Table */}
        <div className="overflow-auto flex-1 p-0">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="sticky top-0 bg-white z-10 shadow-sm">
              <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="p-4 font-semibold">Empresa / Nombre</th>
                <th className="p-4 font-semibold">Contacto Directo</th>
                <th className="p-4 font-semibold">Teléfono</th>
                <th className="p-4 font-semibold">Correo Electrónico</th>
                <th className="p-4 font-semibold text-center">Artículos Vinculados</th>
                <th className="p-4 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-slate-400">
                    <Building className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No se encontraron proveedores.</p>
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((sup) => {
                  const linkedItemsCount = inventory.filter(
                    (i) => i.supplier === sup.name
                  ).length;

                  return (
                    <tr key={sup.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-base shrink-0">
                            {sup.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{sup.name}</p>
                            <p
                              className="text-xs text-slate-400 mt-0.5 max-w-[200px] truncate"
                              title={sup.address || ''}
                            >
                              {sup.address || 'Sin dirección registrada'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 border-b border-slate-100">
                        <p className="font-medium text-slate-700 text-sm">
                          {sup.contact || '-'}
                        </p>
                      </td>
                      <td className="p-4 border-b border-slate-100">
                        {sup.phone ? (
                          <a
                            href={`tel:${sup.phone}`}
                            className="text-slate-600 hover:text-indigo-600 text-sm flex items-center gap-1.5"
                          >
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            <span>{sup.phone}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-4 border-b border-slate-100">
                        {sup.email ? (
                          <a
                            href={`mailto:${sup.email}`}
                            className="text-slate-600 hover:text-indigo-600 text-sm flex items-center gap-1.5"
                          >
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            <span>{sup.email}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-4 border-b border-slate-100 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-xs ${
                            linkedItemsCount > 0
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <Package className="w-3 h-3" />
                          <span>{linkedItemsCount} productos</span>
                        </span>
                      </td>
                      <td className="p-4 border-b border-slate-100 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(sup)}
                            className="text-slate-400 hover:text-indigo-600 transition-colors p-2 rounded-lg hover:bg-indigo-50 cursor-pointer"
                            title="Editar Proveedor"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSupplierToDelete(sup)}
                            className="text-slate-400 hover:text-rose-600 transition-colors p-2 rounded-lg hover:bg-rose-50 cursor-pointer"
                            title="Eliminar Proveedor"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Supplier Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[65] backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <Building className="w-6 h-6 text-indigo-600" />
                <h2 className="text-xl font-bold text-slate-800">
                  {editingSupplier ? 'Editar Proveedor' : 'Registrar Proveedor'}
                </h2>
              </div>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-indigo-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Empresa / Nombre Comercial *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej. Textiles del Norte S.A."
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Nombre del Contacto Directo
                  </label>
                  <input
                    type="text"
                    value={formData.contact}
                    onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                    placeholder="Ej. Juan Pérez (Ejecutivo de Ventas)"
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                      Teléfono / WhatsApp
                    </label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+504 0000-0000"
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="ventas@empresa.com"
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Dirección / Notas Adicionales
                  </label>
                  <textarea
                    rows={2}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Zona Industrial, Bodega 4..."
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none"
                  ></textarea>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  {editingSupplier ? (
                    <button
                      type="button"
                      onClick={() => setSupplierToDelete(editingSupplier)}
                      className="px-4 py-2.5 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors text-sm font-semibold flex items-center gap-2 cursor-pointer"
                      title="Eliminar este proveedor"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Eliminar</span>
                    </button>
                  ) : (
                    <div></div>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition-colors text-sm cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-indigo-600 text-white font-medium hover:bg-indigo-700 rounded-xl shadow-sm transition-colors text-sm flex items-center gap-2 cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      <span>Guardar Proveedor</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Supplier Deletion */}
      <ConfirmDialog
        isOpen={supplierToDelete !== null}
        title="¿Eliminar este proveedor?"
        message={
          supplierToDelete
            ? `Se eliminará a "${supplierToDelete.name}" del directorio de proveedores.`
            : ''
        }
        confirmLabel="Sí, Eliminar Proveedor"
        cancelLabel="Cancelar"
        isDestructive={true}
        onConfirm={() => {
          if (supplierToDelete) {
            onDeleteSupplier(supplierToDelete.id);
            setSupplierToDelete(null);
            if (isModalOpen) handleCloseModal();
          }
        }}
        onCancel={() => setSupplierToDelete(null)}
      />
    </div>
  );
};
