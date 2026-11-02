import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import {
  CompanyTenant,
  SaaSGlobalConfig,
  SaaSContractData,
  SaaSProviderContractDefaults,
  ALL_COMPANY_MODULES,
  getOfficialAppBaseUrl,
} from '../types';
import {
  printHtmlDocument,
  numberToSpanishWords,
  formatCurrencyL,
} from '../utils/printPdfService';
import { SAAS_MODULE_OPTIONS, formatShortDateEs } from './CompaniesSaaSView';
import { WhatsAppIcon } from './SalesView';
import {
  FileText,
  X,
  Printer,
  Download,
  CheckCircle2,
  Building2,
  UserCheck,
  ShieldCheck,
  Save,
  Sparkles,
  Calendar,
  DollarSign,
  Sliders,
  Eye,
  Edit3,
  Clock,
} from 'lucide-react';

interface SaaSContractModalProps {
  isOpen: boolean;
  initialCompany: CompanyTenant | null;
  companies: CompanyTenant[];
  saasGlobalConfig?: SaaSGlobalConfig;
  onClose: () => void;
  onSaveCompany: (company: CompanyTenant) => Promise<void>;
  onSaveSaaSGlobalConfig?: (config: SaaSGlobalConfig) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

const QUICK_CUSTOM_CLAUSES = [
  'Incluye carga masiva inicial de inventario desde Excel y configuración de logo sin costo adicional.',
  'Se garantiza mantenimiento de tarifa preferencial fija durante los primeros doce (12) meses de servicio activo.',
  'Incluye capacitación remota inicial para el propietario y colaboradores en el uso de Caja POS y Bodegas.',
  'El cliente podrá solicitar respaldos completos en formato Excel (CSV) o JSON cuando se encuentre solvente.',
];

export const SaaSContractModal: React.FC<SaaSContractModalProps> = ({
  isOpen,
  initialCompany,
  companies,
  saasGlobalConfig,
  onClose,
  onSaveCompany,
  onSaveSaaSGlobalConfig,
  showToast,
}) => {
  const [selectedSlug, setSelectedSlug] = useState<string>(
    initialCompany?.slug || companies[0]?.slug || 'gosen'
  );
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');
  const [isSaving, setIsSaving] = useState(false);

  const selectedCompany = useMemo(
    () => companies.find((c) => c.slug === selectedSlug) || initialCompany || companies[0] || null,
    [companies, selectedSlug, initialCompany]
  );

  // Contract Form Fields
  const [contractNumber, setContractNumber] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [cityAndCountry, setCityAndCountry] = useState('San Pedro Sula / Tegucigalpa, Honduras');
  const [providerName, setProviderName] = useState('Administración General SaaS');
  const [providerBrand, setProviderBrand] = useState(
    'Plataforma en la Nube de Inventario, Bodegas y Facturación POS'
  );
  const [providerIdentityOrRtn, setProviderIdentityOrRtn] = useState('');
  const [providerPhone, setProviderPhone] = useState('');
  const [providerEmail, setProviderEmail] = useState('Luisenamorell@gmail.com');

  const [clientRepresentative, setClientRepresentative] = useState('');
  const [clientIdentityOrRtn, setClientIdentityOrRtn] = useState('');
  const [clientBusinessName, setClientBusinessName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  const [planModality, setPlanModality] = useState<'mensual' | 'anual' | 'vitalicio' | 'prueba'>(
    'mensual'
  );
  const [agreedPrice, setAgreedPrice] = useState<string>('650');
  const [setupFee, setSetupFee] = useState<string>('0');
  const [billingDayOrDate, setBillingDayOrDate] = useState('');
  const [graceDays, setGraceDays] = useState<string>('3');
  const [supportHours, setSupportHours] = useState(
    'Lunes a Sábado de 8:00 AM a 6:00 PM vía WhatsApp y soporte remoto en línea'
  );
  const [customClauses, setCustomClauses] = useState('');
  const [contractStatus, setContractStatus] = useState<'draft' | 'sent' | 'signed'>('draft');

  useEffect(() => {
    if (initialCompany) {
      setSelectedSlug(initialCompany.slug);
    }
  }, [initialCompany]);

  // Populate fields whenever selectedCompany or saasGlobalConfig changes
  useEffect(() => {
    if (!selectedCompany) return;
    const saved = selectedCompany.contractData;
    const defaults = saasGlobalConfig?.contractDefaults;
    const todayIso = new Date().toISOString().split('T')[0];
    const year = new Date().getFullYear();
    const defaultContractNum = `CONT-SAAS-${year}-${selectedCompany.slug.toUpperCase().slice(0, 5)}`;

    setContractNumber(saved?.contractNumber || defaultContractNum);
    setIssueDate(saved?.issueDate || todayIso);
    setCityAndCountry(
      saved?.cityAndCountry ||
        defaults?.cityAndCountry ||
        'San Pedro Sula / Tegucigalpa, Honduras'
    );
    setProviderName(
      saved?.providerName || defaults?.providerName || 'Luis Enamorado — Proveedor Tecnológico SaaS'
    );
    setProviderBrand(
      saved?.providerBrand ||
        defaults?.providerBrand ||
        saasGlobalConfig?.saasBrandName ||
        'Plataforma Cloud de Inventario, Bodegas y Facturación POS'
    );
    setProviderIdentityOrRtn(
      saved?.providerIdentityOrRtn || defaults?.providerIdentityOrRtn || ''
    );
    setProviderPhone(
      saved?.providerPhone ||
        defaults?.providerPhone ||
        saasGlobalConfig?.saasAdminPhone ||
        ''
    );
    setProviderEmail(
      saved?.providerEmail || defaults?.providerEmail || 'Luisenamorell@gmail.com'
    );

    setClientRepresentative(saved?.clientRepresentative || selectedCompany.ownerName || '');
    setClientIdentityOrRtn(
      saved?.clientIdentityOrRtn || selectedCompany.clientRtnOrId || ''
    );
    setClientBusinessName(saved?.clientBusinessName || selectedCompany.name || '');
    setClientAddress(
      saved?.clientAddress || selectedCompany.address || 'República de Honduras'
    );
    setClientPhone(saved?.clientPhone || selectedCompany.phone || '');

    setPlanModality(saved?.planModality || selectedCompany.plan || 'mensual');
    setAgreedPrice(
      String(saved?.agreedPrice !== undefined ? saved.agreedPrice : selectedCompany.price || 0)
    );
    setSetupFee(String(saved?.setupFee || 0));
    setBillingDayOrDate(saved?.billingDayOrDate || selectedCompany.nextBillingDate || '');
    setGraceDays(
      String(
        saved?.graceDays !== undefined
          ? saved.graceDays
          : saasGlobalConfig?.gracePeriodDays ?? 3
      )
    );
    setSupportHours(
      saved?.supportHours ||
        defaults?.supportHours ||
        'Lunes a Sábado de 8:00 AM a 6:00 PM vía WhatsApp y asistencia remota'
    );
    setCustomClauses(saved?.customClauses ?? defaults?.defaultCustomClauses ?? '');
    setContractStatus(saved?.status || 'draft');
  }, [selectedCompany, saasGlobalConfig]);

  const numericPrice = Math.max(0, Number(agreedPrice) || 0);
  const numericSetupFee = Math.max(0, Number(setupFee) || 0);
  const numericGraceDays = Math.max(0, Number(graceDays) || 0);
  const priceInWords = numberToSpanishWords(numericPrice);

  const enabledModulesLabels = useMemo(() => {
    if (!selectedCompany) return [];
    const activeMods =
      Array.isArray(selectedCompany.allowedModules) && selectedCompany.allowedModules.length > 0
        ? selectedCompany.allowedModules
        : ALL_COMPANY_MODULES;
    return SAAS_MODULE_OPTIONS.filter((m) => activeMods.includes(m.id)).map((m) => m.label);
  }, [selectedCompany]);

  const planPeriodLabel =
    planModality === 'mensual'
      ? 'MENSUAL RECURRENTE'
      : planModality === 'anual'
      ? 'ANUAL RENOVABLE'
      : planModality === 'vitalicio'
      ? 'LICENCIA DE PAGO ÚNICO (VITALICIO)'
      : 'PERIODO DEMOSTRATIVO DE PRUEBA';

  const formattedIssueDateLong = useMemo(() => {
    if (!issueDate) return new Date().toLocaleDateString('es-HN');
    const parts = issueDate.split('-');
    if (parts.length !== 3) return issueDate;
    const months = [
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ];
    const mIdx = Math.max(0, Math.min(11, Number(parts[1]) - 1));
    return `${Number(parts[2])} de ${months[mIdx]} del año ${parts[0]}`;
  }, [issueDate]);

  const bankAccounts = saasGlobalConfig?.bankAccounts || [];

  const officialBaseUrl = getOfficialAppBaseUrl(saasGlobalConfig?.customDomain);
  const clientPortalUrl = `${officialBaseUrl}/?empresa=${selectedCompany?.slug || 'tienda'}`;

  // Structured Legal Clauses used for Preview, Print HTML, and PDF
  const legalClauses = useMemo(() => {
    const compSlug = selectedCompany?.slug || 'tienda';
    const compName = selectedCompany?.name || 'El Negocio';
    const maxProds = selectedCompany?.maxProducts || 0;
    const maxUsrs = selectedCompany?.maxUsers || 0;
    const portalLink = `${officialBaseUrl}/?empresa=${compSlug}`;

    return [
      {
        title: 'CLÁUSULA PRIMERA: OBJETO DEL CONTRATO Y CONCESIÓN DE LICENCIA SAAS',
        body: `Por medio del presente contrato, EL PROVEEDOR otorga a favor de EL CLIENTE una licencia de uso no exclusiva, intransferible y temporal bajo la modalidad de Software como Servicio en la Nube (SaaS) sobre el sistema "${providerBrand}" (portal web oficial: ${portalLink}), asignándole el entorno privado e independiente identificado con el Código de Empresa único "${compSlug}" para la gestión operativa de su negocio denominado "${
          clientBusinessName || compName
        }".`,
      },
      {
        title: 'CLÁUSULA SEGUNDA: MÓDULOS HABILITADOS Y CAPACIDAD OPERATIVA',
        body: `El servicio contratado incluye acceso en tiempo real desde computadoras, teléfonos móviles y tabletas a los siguientes módulos autorizados (${enabledModulesLabels.length}): ${enabledModulesLabels.join(
          ', '
        )}. La capacidad técnica asignada al plan de EL CLIENTE comprende un límite de ${
          maxProds > 0
            ? `${maxProds.toLocaleString('es-HN')} artículos en catálogo`
            : 'Artículos ILIMITADOS en inventario'
        } y hasta ${
          maxUsrs > 0
            ? `${maxUsrs} cuentas de colaboradores/cajeros`
            : 'Usuarios colaboradores ILIMITADOS'
        }.`,
      },
      {
        title: 'CLÁUSULA TERCERA: CANON DE SUSCRIPCIÓN, MODALIDAD Y FORMA DE PAGO',
        body: `Ambas partes acuerdan que la suscripción se rige bajo la modalidad ${planPeriodLabel}, con un canon o cuota acordada de ${formatCurrencyL(
          numericPrice
        )} (${priceInWords})${
          numericSetupFee > 0
            ? `, más una cuota única de activación e implementación inicial de ${formatCurrencyL(
                numericSetupFee
              )}`
            : ''
        }. La fecha de corte y renovación queda establecida para el día ${
          billingDayOrDate ? formatShortDateEs(billingDayOrDate) : 'acordado mensualmente'
        }. Los pagos podrán efectuarse vía transferencia bancaria, depósito o efectivo a las cuentas autorizadas por EL PROVEEDOR${
          bankAccounts.length > 0
            ? `: ${bankAccounts
                .map(
                  (b) =>
                    `${b.bankName} (${b.accountType}) N° ${b.accountNumber} a nombre de ${b.holderName}`
                )
                .join(' | ')}`
            : '.'
        }`,
      },
      {
        title: 'CLÁUSULA CUARTA: POLÍTICA DE CORTE, DÍAS DE GRACIA Y SUSPENSIÓN POR MORA',
        body: `El sistema notificará preventivamente a EL CLIENTE antes de su fecha de vencimiento. Una vez cumplida la fecha de corte, EL CLIENTE contará con un período de gracia de ${numericGraceDays} día(s) calendario para reportar su pago. Transcurrido dicho plazo sin haberse acreditado la renovación, el sistema aplicará de forma automática la suspensión temporal del acceso por mora. Durante la suspensión, el inventario, historial de ventas y configuraciones de EL CLIENTE permanecerán 100% resguardados y se reactivarán de inmediato al confirmar el pago pendiente.`,
      },
      {
        title: 'CLÁUSULA QUINTA: PROPIEDAD INTELECTUAL DEL SOFTWARE',
        body: `EL CLIENTE reconoce que el código fuente, algoritmos, diseño visual, estructura de base de datos, logotipos de la plataforma y actualizaciones de "${providerBrand}" son propiedad intelectual exclusiva de EL PROVEEDOR. El presente contrato concede únicamente el derecho de uso operativo del sistema y prohíbe expresamente la copia, ingeniería inversa, subarrendamiento, reventa o cesión de accesos a terceros ajenos al negocio de EL CLIENTE.`,
      },
      {
        title: 'CLÁUSULA SEXTA: PROPIEDAD, PRIVACIDAD Y AISLAMIENTO DE DATOS DEL CLIENTE',
        body: `Toda la información comercial ingresada por EL CLIENTE (incluyendo su catálogo de productos, costos, precios, fotografías, cartera de proveedores, clientes, bodegas y facturación) es propiedad exclusiva de EL CLIENTE. La plataforma opera con arquitectura multi-empresa aislada, garantizando que ninguna otra tienda tenga acceso a sus registros. EL PROVEEDOR mantendrá estricta confidencialidad sobre la información financiera y operativa de EL CLIENTE.`,
      },
      {
        title: 'CLÁUSULA SÉPTIMA: DISPONIBILIDAD EN LA NUBE Y RESPALDO DE INFORMACIÓN',
        body: `El sistema funciona con sincronización en tiempo real en la nube (Google Firebase Cloud Infrastructure) permitiendo operación continua e impresión de tickets/facturas. EL CLIENTE cuenta además con funciones de exportación a Excel (CSV) y respaldo integral para conservar copias locales periódicas de su operación.`,
      },
      {
        title: 'CLÁUSULA OCTAVA: SOPORTE TÉCNICO Y ACTUALIZACIONES CONTINUAS',
        body: `EL PROVEEDOR brindará asistencia técnica y atención a consultas en horario de: ${supportHours}. Todas las mejoras de seguridad, optimizaciones de velocidad y actualizaciones de los módulos contratados se aplicarán automáticamente sin costo adicional para EL CLIENTE mientras su suscripción se mantenga activa.`,
      },
      {
        title: 'CLÁUSULA NOVENA: RESPONSABILIDAD SOBRE CREDENCIALES Y OPERACIÓN COMERCIAL',
        body: `EL CLIENTE es el único responsable del resguardo de su Contraseña de Administrador y de los permisos que asigne a sus colaboradores o cajeros dentro del módulo de Usuarios, así como de la veracidad de los precios, descuentos, control físico de bodegas y cumplimiento de sus obligaciones tributarias o comerciales ante las autoridades correspondientes.`,
      },
      {
        title: 'CLÁUSULA DÉCIMA: VIGENCIA, TERMINACIÓN Y ENTREGA DE DATOS',
        body: `El presente contrato entra en vigor en la fecha de su emisión (${formattedIssueDateLong}) y se renueva según la modalidad contratada (${planModality.toUpperCase()}). Cualquiera de las partes podrá dar por terminado el servicio notificando con al menos quince (15) días de anticipación. En caso de terminación voluntaria encontrándose al día en sus pagos, EL PROVEEDOR facilitará a EL CLIENTE un archivo de respaldo completo de su inventario e historial de ventas.`,
      },
    ];
  }, [
    providerBrand,
    selectedCompany,
    clientBusinessName,
    enabledModulesLabels,
    planPeriodLabel,
    numericPrice,
    priceInWords,
    numericSetupFee,
    billingDayOrDate,
    bankAccounts,
    numericGraceDays,
    supportHours,
    formattedIssueDateLong,
    planModality,
    officialBaseUrl,
  ]);

  if (!isOpen || !selectedCompany) return null;

  const buildContractObject = (overrideStatus?: 'draft' | 'sent' | 'signed'): SaaSContractData => ({
    contractNumber: contractNumber.trim() || `CONT-SAAS-${selectedCompany.slug.toUpperCase()}`,
    issueDate,
    cityAndCountry: cityAndCountry.trim(),
    providerName: providerName.trim(),
    providerBrand: providerBrand.trim(),
    providerIdentityOrRtn: providerIdentityOrRtn.trim(),
    providerPhone: providerPhone.trim(),
    providerEmail: providerEmail.trim(),
    clientRepresentative: clientRepresentative.trim() || selectedCompany.ownerName || 'Propietario',
    clientIdentityOrRtn: clientIdentityOrRtn.trim(),
    clientBusinessName: clientBusinessName.trim() || selectedCompany.name,
    clientAddress: clientAddress.trim(),
    clientPhone: clientPhone.trim(),
    planModality,
    agreedPrice: numericPrice,
    setupFee: numericSetupFee,
    billingDayOrDate: billingDayOrDate.trim(),
    graceDays: numericGraceDays,
    supportHours: supportHours.trim(),
    customClauses: customClauses.trim(),
    status: overrideStatus || contractStatus,
    signedAt:
      (overrideStatus || contractStatus) === 'signed'
        ? new Date().toLocaleDateString('es-HN')
        : selectedCompany.contractData?.signedAt,
    updatedAt: Date.now(),
  });

  const handleSaveContractToCloud = async (overrideStatus?: 'draft' | 'sent' | 'signed') => {
    setIsSaving(true);
    try {
      const contractPayload = buildContractObject(overrideStatus);
      if (overrideStatus) {
        setContractStatus(overrideStatus);
      }

      // 1. Save on Client CompanyTenant
      await onSaveCompany({
        ...selectedCompany,
        ownerName: contractPayload.clientRepresentative || selectedCompany.ownerName,
        phone: contractPayload.clientPhone || selectedCompany.phone,
        address: contractPayload.clientAddress || selectedCompany.address,
        clientRtnOrId: contractPayload.clientIdentityOrRtn,
        plan: contractPayload.planModality,
        price: contractPayload.agreedPrice,
        nextBillingDate: contractPayload.billingDayOrDate || selectedCompany.nextBillingDate,
        contractData: contractPayload,
      });

      // 2. Save Provider Defaults on SaaSGlobalConfig so next client contracts auto-fill
      if (onSaveSaaSGlobalConfig && saasGlobalConfig) {
        const providerDefaults: SaaSProviderContractDefaults = {
          providerName: contractPayload.providerName,
          providerBrand: contractPayload.providerBrand,
          providerIdentityOrRtn: contractPayload.providerIdentityOrRtn,
          providerPhone: contractPayload.providerPhone,
          providerEmail: contractPayload.providerEmail,
          cityAndCountry: contractPayload.cityAndCountry,
          supportHours: contractPayload.supportHours,
          defaultCustomClauses: contractPayload.customClauses,
        };
        await onSaveSaaSGlobalConfig({
          ...saasGlobalConfig,
          contractDefaults: providerDefaults,
          updatedAt: Date.now(),
        });
      }

      showToast(
        `✅ Contrato ${contractPayload.contractNumber} guardado en la ficha de "${selectedCompany.name}"`,
        'success'
      );
    } catch (err: any) {
      showToast('Error al guardar el contrato: ' + (err?.message || 'desconocido'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Generate Formal Printable HTML (Letter / A4)
  const buildPrintableContractHtml = () => {
    const statusLabel =
      contractStatus === 'signed'
        ? 'CONTRATO FIRMADO Y VIGENTE'
        : contractStatus === 'sent'
        ? 'ENVIADO PARA FIRMA / ACEPTACIÓN'
        : 'BORRADOR OFICIAL DE CONTRATO';

    return `
      <div style="font-family: 'Georgia', 'Times New Roman', serif; color: #0f172a; line-height: 1.55; padding: 8px 12px;">
        <!-- Top Institutional Header -->
        <div style="border-bottom: 3px double #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
          <div>
            <div style="font-family: 'Inter', Arial, sans-serif; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #047857;">
              DOCUMENTO LEGAL DE LICENCIA Y SUSCRIPCIÓN TECNOLÓGICA (SAAS)
            </div>
            <h1 style="font-family: 'Inter', Arial, sans-serif; font-size: 18px; font-weight: 900; margin: 4px 0 2px; color: #0f172a; text-transform: uppercase;">
              CONTRATO DE PRESTACIÓN DE SERVICIOS Y LICENCIA DE USO DE SOFTWARE EN LA NUBE
            </h1>
            <div style="font-family: 'Inter', Arial, sans-serif; font-size: 11px; color: #475569; font-weight: 600;">
              ${providerBrand} •Lugar y Fecha: ${cityAndCountry}, ${formattedIssueDateLong}
            </div>
          </div>
          <div style="text-align: right; font-family: 'Inter', Arial, sans-serif; shrink: 0;">
            <div style="display: inline-block; background: #0f172a; color: #ffffff; font-size: 11px; font-weight: 900; padding: 4px 10px; border-radius: 6px; font-family: monospace;">
              ${contractNumber}
            </div>
            <div style="font-size: 9.5px; font-weight: 800; color: #047857; margin-top: 4px; text-transform: uppercase;">
              ${statusLabel}
            </div>
          </div>
        </div>

        <!-- Comparecen / Parties Intro -->
        <p style="font-size: 12px; text-align: justify; margin: 0 0 12px;">
          Nosotros, por una parte: <strong>${providerName.toUpperCase()}</strong>${
      providerIdentityOrRtn ? `, con documento de Identidad / RTN N° <strong>${providerIdentityOrRtn}</strong>` : ''
    }${providerPhone ? `, teléfono <strong>${providerPhone}</strong>` : ''}${
      providerEmail ? ` y correo electrónico <strong>${providerEmail}</strong>` : ''
    }, actuando en calidad de propietario y proveedor tecnológico de la plataforma <strong>"${providerBrand}"</strong>, quien en adelante se denominará <strong>"EL PROVEEDOR"</strong>; y por la otra parte: <strong>${(
      clientRepresentative || selectedCompany.ownerName || 'EL REPRESENTANTE'
    ).toUpperCase()}</strong>${
      clientIdentityOrRtn ? `, con documento de Identidad / RTN N° <strong>${clientIdentityOrRtn}</strong>` : ''
    }, actuando en su condición de propietario/representante legal del establecimiento comercial denominado <strong>"${(
      clientBusinessName || selectedCompany.name
    ).toUpperCase()}"</strong> (Código de Sistema: <strong>${selectedCompany.slug}</strong>), ubicado en <strong>${
      clientAddress || 'Honduras'
    }</strong>${
      clientPhone ? ` y teléfono <strong>${clientPhone}</strong>` : ''
    }, quien en adelante se denominará <strong>"EL CLIENTE"</strong>; hemos convenido en celebrar, como en efecto celebramos, el presente <strong>CONTRATO DE LICENCIA DE USO Y SUSCRIPCIÓN DE SOFTWARE (SAAS)</strong>, el cual se regirá por el cuadro técnico-económico y las cláusulas siguientes:
        </p>

        <!-- Summary Box -->
        <table style="width: 100%; border-collapse: collapse; margin: 12px 0 16px; font-family: 'Inter', Arial, sans-serif; font-size: 11px; border: 1px solid #cbd5e1;">
          <thead>
            <tr style="background: #0f172a; color: #ffffff;">
              <th colspan="4" style="padding: 6px 10px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em;">
                RESUMEN TÉCNICO Y ECONÓMICO DE LA SUSCRIPCIÓN CONTRATADA
              </th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #cbd5e1; background: #f8fafc;">
              <td style="padding: 6px 8px; font-weight: 700; color: #475569; width: 22%;">Negocio / Tienda:</td>
              <td style="padding: 6px 8px; font-weight: 900; color: #0f172a; width: 28%;">${
                clientBusinessName || selectedCompany.name
              } (ID: ${selectedCompany.slug})</td>
              <td style="padding: 6px 8px; font-weight: 700; color: #475569; width: 22%;">Modalidad del Plan:</td>
              <td style="padding: 6px 8px; font-weight: 900; color: #047857; width: 28%;">${planPeriodLabel}</td>
            </tr>
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 6px 8px; font-weight: 700; color: #475569;">Cuota Acordada:</td>
              <td style="padding: 6px 8px; font-weight: 900; color: #0f172a;">${formatCurrencyL(
                numericPrice
              )} (${planModality.toUpperCase()})</td>
              <td style="padding: 6px 8px; font-weight: 700; color: #475569;">Fecha de Corte / Pago:</td>
              <td style="padding: 6px 8px; font-weight: 800; color: #0f172a;">${
                billingDayOrDate ? formatShortDateEs(billingDayOrDate) : 'Según ciclo acordado'
              } (${numericGraceDays}d gracia)</td>
            </tr>
            <tr style="background: #f8fafc;">
              <td style="padding: 6px 8px; font-weight: 700; color: #475569;">Capacidad del Plan:</td>
              <td style="padding: 6px 8px; font-weight: 800; color: #0f172a;">
                Prod: ${
                  selectedCompany.maxProducts && selectedCompany.maxProducts > 0
                    ? selectedCompany.maxProducts
                    : 'Ilimitados'
                } • Usuarios: ${
      selectedCompany.maxUsers && selectedCompany.maxUsers > 0
        ? selectedCompany.maxUsers
        : 'Ilimitados'
    }
              </td>
              <td style="padding: 6px 8px; font-weight: 700; color: #475569;">Activación Inicial:</td>
              <td style="padding: 6px 8px; font-weight: 800; color: #0f172a;">${
                numericSetupFee > 0 ? formatCurrencyL(numericSetupFee) : 'L. 0.00 (Sin costo de instalación)'
              }</td>
            </tr>
          </tbody>
        </table>

        <!-- Clauses -->
        <div style="font-size: 11.5px;">
          ${legalClauses
            .map(
              (cl) => `
            <div style="margin-bottom: 10px; text-align: justify;">
              <div style="font-family: 'Inter', Arial, sans-serif; font-weight: 900; font-size: 11px; color: #0f172a; text-transform: uppercase; margin-bottom: 2px;">
                ${cl.title}
              </div>
              <div>${cl.body}</div>
            </div>
          `
            )
            .join('')}

          ${
            customClauses.trim()
              ? `
            <div style="margin-bottom: 12px; padding: 8px 10px; background: #f8fafc; border-left: 3px solid #047857; text-align: justify;">
              <div style="font-family: 'Inter', Arial, sans-serif; font-weight: 900; font-size: 11px; color: #047857; text-transform: uppercase; margin-bottom: 2px;">
                CLÁUSULA ADICIONAL: ACUERDOS ESPECIALES Y CONDICIONES PARTICULARES
              </div>
              <div>${customClauses.trim().replace(/\n/g, '<br/>')}</div>
            </div>
          `
              : ''
          }
        </div>

        <!-- Acceptance Paragraph -->
        <p style="font-size: 11.5px; text-align: justify; margin-top: 12px; font-weight: 600;">
          En fe de lo cual, ambas partes declaran haber leído, comprendido y aceptado todas y cada una de las cláusulas contenidas en este documento, firmando de conformidad en la ciudad de ${cityAndCountry}, a los ${formattedIssueDateLong}.
        </p>

        <!-- Signatures Block -->
        <div style="display: flex; justify-content: space-between; gap: 36px; margin-top: 42px; padding-top: 16px; font-family: 'Inter', Arial, sans-serif;">
          <div style="flex: 1; text-align: center;">
            <div style="border-bottom: 1.5px solid #0f172a; height: 42px; margin-bottom: 6px;"></div>
            <div style="font-weight: 900; font-size: 12px; color: #0f172a; text-transform: uppercase;">
              ${providerName}
            </div>
            <div style="font-size: 10.5px; font-weight: 700; color: #047857;">
              EL PROVEEDOR / LICENCIANTE SAAS
            </div>
            ${
              providerIdentityOrRtn
                ? `<div style="font-size: 10px; color: #475569;">ID / RTN: ${providerIdentityOrRtn}</div>`
                : ''
            }
            <div style="font-size: 10px; color: #64748b;">${providerBrand}</div>
          </div>

          <div style="flex: 1; text-align: center;">
            <div style="border-bottom: 1.5px solid #0f172a; height: 42px; margin-bottom: 6px;"></div>
            <div style="font-weight: 900; font-size: 12px; color: #0f172a; text-transform: uppercase;">
              ${clientRepresentative || selectedCompany.ownerName || 'REPRESENTANTE DEL CLIENTE'}
            </div>
            <div style="font-size: 10.5px; font-weight: 700; color: #0f172a;">
              EL CLIENTE / SUSCRIPTOR (${clientBusinessName || selectedCompany.name})
            </div>
            ${
              clientIdentityOrRtn
                ? `<div style="font-size: 10px; color: #475569;">ID / RTN: ${clientIdentityOrRtn}</div>`
                : '<div style="font-size: 10px; color: #64748b;">ID / RTN: ___________________________</div>'
            }
            <div style="font-size: 10px; color: #64748b;">Código de Tienda: ${selectedCompany.slug}</div>
          </div>
        </div>
      </div>
    `;
  };

  const handlePrintContract = () => {
    const html = buildPrintableContractHtml();
    printHtmlDocument(
      html,
      `Contrato SaaS ${contractNumber} - ${clientBusinessName || selectedCompany.name}`,
      'letter'
    );
  };

  // Generate Native Multi-Page PDF via jsPDF
  const handleDownloadContractPdf = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'letter',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;

    // Top Header Banner
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 6, 'F');
    doc.setFillColor(4, 120, 87);
    doc.rect(0, 6, pageWidth, 1.5, 'F');

    let y = 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(4, 120, 87);
    doc.text('DOCUMENTO LEGAL DE LICENCIA Y SUSCRIPCIÓN TECNOLÓGICA (SAAS)', margin, y);

    doc.setFont('courier', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(contractNumber, pageWidth - margin, y, { align: 'right' });

    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    const mainTitleLines = doc.splitTextToSize(
      'CONTRATO DE PRESTACIÓN DE SERVICIOS Y LICENCIA DE USO DE SOFTWARE EN LA NUBE',
      contentWidth
    );
    doc.text(mainTitleLines, margin, y);
    y += mainTitleLines.length * 5.2;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`${providerBrand}  •  ${cityAndCountry}, ${formattedIssueDateLong}`, margin, y);
    y += 4;

    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    // Intro Paragraph
    doc.setFont('times', 'normal');
    doc.setFontSize(10.2);
    doc.setTextColor(15, 23, 42);
    const introText = `Nosotros, por una parte: ${providerName.toUpperCase()}${
      providerIdentityOrRtn ? `, con ID/RTN N° ${providerIdentityOrRtn}` : ''
    }${providerPhone ? `, Tel. ${providerPhone}` : ''}, actuando en calidad de proveedor tecnológico de la plataforma "${providerBrand}" (en adelante "EL PROVEEDOR"); y por la otra parte: ${(
      clientRepresentative ||
      selectedCompany.ownerName ||
      'EL REPRESENTANTE'
    ).toUpperCase()}${
      clientIdentityOrRtn ? `, con ID/RTN N° ${clientIdentityOrRtn}` : ''
    }, actuando en representación del negocio "${(
      clientBusinessName || selectedCompany.name
    ).toUpperCase()}" (Código: ${selectedCompany.slug}), ubicado en ${
      clientAddress || 'Honduras'
    }${
      clientPhone ? `, Tel. ${clientPhone}` : ''
    } (en adelante "EL CLIENTE"); celebramos el presente CONTRATO DE LICENCIA DE USO Y SUSCRIPCIÓN DE SOFTWARE (SAAS), sujeto a las condiciones y cláusulas siguientes:`;

    const introLines = doc.splitTextToSize(introText, contentWidth);
    doc.text(introLines, margin, y);
    y += introLines.length * 4.5 + 3;

    // Summary Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(4, 120, 87);
    doc.text('FICHA TÉCNICA Y ECONÓMICA DEL SERVICIO CONTRATADO', margin + 4, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `• Tienda Cliente: ${clientBusinessName || selectedCompany.name} (Código: ${selectedCompany.slug})`,
      margin + 4,
      y + 10.5
    );
    doc.text(
      `• Plan y Cuota: ${planPeriodLabel} — ${formatCurrencyL(numericPrice)}`,
      margin + 4,
      y + 15.5
    );
    doc.text(
      `• Próximo Corte: ${
        billingDayOrDate ? formatShortDateEs(billingDayOrDate) : 'Mensual'
      } (${numericGraceDays} días de gracia)   •   Activación: ${formatCurrencyL(numericSetupFee)}`,
      margin + 4,
      y + 20
    );

    y += 28;

    const ensureSpace = (neededMm: number) => {
      if (y + neededMm > pageHeight - 20) {
        doc.addPage();
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageWidth, 4, 'F');
        y = 15;
      }
    };

    // Clauses
    for (const clause of legalClauses) {
      const bodyLines = doc.splitTextToSize(clause.body, contentWidth);
      const blockHeight = 5 + bodyLines.length * 4.3 + 3;
      ensureSpace(blockHeight);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(clause.title, margin, y);
      y += 4.5;

      doc.setFont('times', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text(bodyLines, margin, y);
      y += bodyLines.length * 4.3 + 3.5;
    }

    if (customClauses.trim()) {
      const customLines = doc.splitTextToSize(customClauses.trim(), contentWidth - 6);
      const blockH = 8 + customLines.length * 4.3 + 4;
      ensureSpace(blockH);

      doc.setFillColor(240, 253, 250);
      doc.setDrawColor(153, 246, 228);
      doc.roundedRect(margin, y - 2, contentWidth, blockH, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(4, 120, 87);
      doc.text('CLÁUSULA ADICIONAL: ACUERDOS ESPECIALES', margin + 3, y + 3);
      y += 7.5;

      doc.setFont('times', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(customLines, margin + 3, y);
      y += customLines.length * 4.3 + 6;
    }

    // Acceptance & Signatures
    ensureSpace(50);
    doc.setFont('times', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    const closingLines = doc.splitTextToSize(
      `En fe de lo cual, ambas partes declaran estar de acuerdo con todas las cláusulas del presente contrato, firmando en ${cityAndCountry}, a los ${formattedIssueDateLong}.`,
      contentWidth
    );
    doc.text(closingLines, margin, y);
    y += closingLines.length * 4.5 + 22;

    const sigBoxW = (contentWidth - 24) / 2;
    const leftSigX = margin;
    const rightSigX = margin + sigBoxW + 24;

    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.line(leftSigX, y, leftSigX + sigBoxW, y);
    doc.line(rightSigX, y, rightSigX + sigBoxW, y);

    y += 4.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(providerName.toUpperCase(), leftSigX + sigBoxW / 2, y, { align: 'center' });
    doc.text(
      (clientRepresentative || selectedCompany.ownerName || 'REPRESENTANTE').toUpperCase(),
      rightSigX + sigBoxW / 2,
      y,
      { align: 'center' }
    );

    y += 4;
    doc.setFontSize(8);
    doc.setTextColor(4, 120, 87);
    doc.text('EL PROVEEDOR / LICENCIANTE SAAS', leftSigX + sigBoxW / 2, y, { align: 'center' });
    doc.setTextColor(15, 23, 42);
    doc.text(
      `EL CLIENTE (${clientBusinessName || selectedCompany.name})`,
      rightSigX + sigBoxW / 2,
      y,
      { align: 'center' }
    );

    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      providerIdentityOrRtn ? `ID / RTN: ${providerIdentityOrRtn}` : providerBrand,
      leftSigX + sigBoxW / 2,
      y,
      { align: 'center' }
    );
    doc.text(
      clientIdentityOrRtn ? `ID / RTN: ${clientIdentityOrRtn}` : 'ID / RTN: _______________________',
      rightSigX + sigBoxW / 2,
      y,
      { align: 'center' }
    );

    // Page numbers
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Contrato ${contractNumber} • ${clientBusinessName || selectedCompany.name} (${selectedCompany.slug})`,
        margin,
        pageHeight - 8
      );
      doc.text(`Página ${p} de ${totalPages}`, pageWidth - margin, pageHeight - 8, {
        align: 'right',
      });
    }

    const safeFile = `Contrato_SaaS_${selectedCompany.slug}_${issueDate}.pdf`;
    doc.save(safeFile);
    showToast(`📄 Contrato descargado como ${safeFile}`, 'success');
  };

  // Send Contract Summary & Acceptance Request via WhatsApp
  const handleSendContractWhatsApp = async () => {
    await handleSaveContractToCloud(contractStatus === 'draft' ? 'sent' : contractStatus);

    const msg =
      `📜 *CONTRATO DE LICENCIA DE USO Y SUSCRIPCIÓN SAAS*\n` +
      `*N° Contrato:* \`${contractNumber}\`\n` +
      `*Fecha:* ${formattedIssueDateLong}\n\n` +
      `Hola *${clientRepresentative || selectedCompany.ownerName}*, adjunto los términos oficiales de tu licencia de uso del sistema para *${
        clientBusinessName || selectedCompany.name
      }* (Código: \`${selectedCompany.slug}\`):\n\n` +
      `📌 *RESUMEN DEL CONTRATO:*\n` +
      `• *Proveedor SaaS:* ${providerName}\n` +
      `• *Cliente / Tienda:* ${clientBusinessName || selectedCompany.name}${
        clientIdentityOrRtn ? ` (ID/RTN: ${clientIdentityOrRtn})` : ''
      }\n` +
      `• *Portal Web Oficial:* ${clientPortalUrl}\n` +
      `• *Modalidad de Plan:* ${planPeriodLabel}\n` +
      `• *Cuota Acordada:* ${formatCurrencyL(numericPrice)}\n` +
      (numericSetupFee > 0 ? `• *Implementación Inicial:* ${formatCurrencyL(numericSetupFee)}\n` : '') +
      `• *Fecha de Corte:* ${
        billingDayOrDate ? formatShortDateEs(billingDayOrDate) : 'Mensual'
      } (${numericGraceDays} días de gracia)\n` +
      `• *Módulos Incluidos (${enabledModulesLabels.length}):* ${enabledModulesLabels.join(', ')}\n\n` +
      `⚖️ *GARANTÍAS PRINCIPALES:*\n` +
      `1. *Propiedad de tus Datos:* Todo tu inventario, precios y ventas son 100% privados y exclusivos de tu tienda.\n` +
      `2. *Respaldo en la Nube:* Sincronización en tiempo real en celular, tablet y computadora.\n` +
      `3. *Soporte y Actualizaciones:* Asistencia técnica (${supportHours}) y mejoras continuas incluidas.\n` +
      `4. *Política de Corte:* Aviso previo automático y ${numericGraceDays} día(s) de gracia; tus datos jamás se pierden.\n` +
      (customClauses.trim() ? `\n✨ *Acuerdos Especiales:* ${customClauses.trim()}\n` : '') +
      `\n✍️ *CONFIRMACIÓN DIGITAL:*\n` +
      `Por favor responde a este mensaje con *"ACEPTO CONFORME EL CONTRATO ${contractNumber}"* o envíanos el documento PDF firmado para dejarlo registrado como vigente en tu expediente.`;

    const cleanPhone = (clientPhone || selectedCompany.phone || '').replace(/\D/g, '');
    const waUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;

    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-7xl max-h-[95vh] flex flex-col overflow-hidden my-auto">
        {/* Top Modal Header */}
        <div className="px-4 sm:px-6 py-4 bg-slate-950 text-white border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-black text-white text-sm sm:text-base tracking-tight">
                  Generador de Contrato de Licencia y Uso de la App (SaaS)
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${
                    contractStatus === 'signed'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                      : contractStatus === 'sent'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {contractStatus === 'signed'
                    ? '✓ Firmado y Vigente'
                    : contractStatus === 'sent'
                    ? '⏳ Enviado al Cliente'
                    : '📝 Borrador Editable'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                Personaliza las cláusulas, guarda el expediente legal del cliente, imprime en hoja Carta, descarga en PDF o envíalo por WhatsApp.
              </p>
            </div>
          </div>

          {/* Client Selector & Top Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5">
              <Building2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span className="text-[10px] font-bold uppercase text-slate-400">Tienda:</span>
              <select
                value={selectedSlug}
                onChange={(e) => setSelectedSlug(e.target.value)}
                className="bg-transparent text-xs font-extrabold text-white focus:outline-none cursor-pointer pr-1"
              >
                {companies.map((c) => (
                  <option key={c.slug} value={c.slug} className="bg-slate-900 text-white">
                    {c.name} ({c.slug})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSaveContractToCloud()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-xs transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Guardando...' : 'Guardar'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrintContract}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 font-extrabold text-xs transition-all cursor-pointer"
              title="Imprimir contrato formal en formato Carta / A4 con bloques de firma"
            >
              <Printer className="w-3.5 h-3.5 text-teal-300" />
              <span>Imprimir Carta</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadContractPdf}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs transition-all cursor-pointer shadow-xs"
              title="Descargar el contrato completo en archivo PDF listo para enviar o firmar"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar PDF</span>
            </button>

            <button
              type="button"
              onClick={handleSendContractWhatsApp}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs transition-all cursor-pointer shadow-xs"
              title="Enviar resumen legal del contrato por WhatsApp para aceptación del cliente"
            >
              <WhatsAppIcon className="w-3.5 h-3.5" />
              <span>Enviar a WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile View Switcher (Editor vs Vista Previa) */}
        <div className="flex lg:hidden border-b border-slate-200 bg-slate-100 p-1.5 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab('editor')}
            className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
              mobileTab === 'editor'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>1. Datos y Cláusulas</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('preview')}
            className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
              mobileTab === 'preview'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>2. Vista Previa Legal</span>
          </button>
        </div>

        {/* Main Split Body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* LEFT COLUMN: CONTRACT DATA & CLAUSES EDITOR (5 cols on desktop) */}
          <div
            className={`lg:col-span-5 overflow-y-auto p-4 sm:p-5 space-y-4 border-r border-slate-200 bg-slate-50/70 ${
              mobileTab === 'preview' ? 'hidden lg:block' : 'block'
            }`}
          >
            {/* Status & Document Meta */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-wide text-slate-900 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-teal-600" />
                  <span>Datos del Documento</span>
                </span>
                <div className="flex items-center gap-1">
                  {(['draft', 'sent', 'signed'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setContractStatus(st)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all cursor-pointer ${
                        contractStatus === st
                          ? st === 'signed'
                            ? 'bg-emerald-600 text-white'
                            : st === 'sent'
                            ? 'bg-amber-500 text-white'
                            : 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st === 'draft' ? 'Borrador' : st === 'sent' ? 'Enviado' : 'Firmado'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    N° de Contrato
                  </label>
                  <input
                    type="text"
                    value={contractNumber}
                    onChange={(e) => setContractNumber(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs font-black text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Fecha de Emisión
                  </label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Ciudad y País (Jurisdicción)
                  </label>
                  <input
                    type="text"
                    value={cityAndCountry}
                    onChange={(e) => setCityAndCountry(e.target.value)}
                    placeholder="Ej. San Pedro Sula, Cortés, Honduras"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* 1. Provider Info */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wide text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>1. Datos del Proveedor (Tú / Licenciante SaaS)</span>
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  Se guarda por defecto
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Tu Nombre Legal o Empresa Proveedora *
                  </label>
                  <input
                    type="text"
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                    placeholder="Ej. Luis Enamorado / Soluciones Cloud HN"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Tu DNI / Identidad o RTN
                  </label>
                  <input
                    type="text"
                    value={providerIdentityOrRtn}
                    onChange={(e) => setProviderIdentityOrRtn(e.target.value)}
                    placeholder="Ej. 0501-XXXX-XXXXX"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono text-xs font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Teléfono / WhatsApp Soporte
                  </label>
                  <input
                    type="text"
                    value={providerPhone}
                    onChange={(e) => setProviderPhone(e.target.value)}
                    placeholder="Ej. +504 9988-7766"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono text-xs font-bold text-slate-800"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Nombre Comercial de tu Plataforma / Software
                  </label>
                  <input
                    type="text"
                    value={providerBrand}
                    onChange={(e) => setProviderBrand(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* 2. Client Info */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
              <div className="text-xs font-black uppercase tracking-wide text-slate-900 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                <span>2. Datos del Cliente (Suscriptor / Tienda)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Nombre del Negocio / Tienda *
                  </label>
                  <input
                    type="text"
                    value={clientBusinessName}
                    onChange={(e) => setClientBusinessName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Propietario / Representante *
                  </label>
                  <input
                    type="text"
                    value={clientRepresentative}
                    onChange={(e) => setClientRepresentative(e.target.value)}
                    placeholder="Nombre completo del dueño"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    DNI / Identidad o RTN Cliente
                  </label>
                  <input
                    type="text"
                    value={clientIdentityOrRtn}
                    onChange={(e) => setClientIdentityOrRtn(e.target.value)}
                    placeholder="Ej. 0801-1990-12345"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono text-xs font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    WhatsApp / Teléfono Cliente
                  </label>
                  <input
                    type="text"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="Ej. 50499001122"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono text-xs font-bold text-slate-800"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Dirección Física del Negocio
                  </label>
                  <input
                    type="text"
                    value={clientAddress}
                    onChange={(e) => setClientAddress(e.target.value)}
                    placeholder="Barrio, Colonia, Ciudad, Departamento"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* 3. Economic & Technical Terms */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
              <div className="text-xs font-black uppercase tracking-wide text-slate-900 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-teal-600" />
                <span>3. Condiciones Económicas, Corte y Soporte</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Modalidad Plan
                  </label>
                  <select
                    value={planModality}
                    onChange={(e) => setPlanModality(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900"
                  >
                    <option value="mensual">Mensual</option>
                    <option value="anual">Anual</option>
                    <option value="vitalicio">Pago Único</option>
                    <option value="prueba">Prueba Demo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Cuota Acordada (L.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={agreedPrice}
                    onChange={(e) => setAgreedPrice(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-black text-emerald-700"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Instalación Inicial (L.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={setupFee}
                    onChange={(e) => setSetupFee(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800"
                  />
                </div>

                <div className="col-span-2 sm:col-span-2">
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Fecha de Corte / Próximo Pago
                  </label>
                  <input
                    type="date"
                    value={billingDayOrDate}
                    onChange={(e) => setBillingDayOrDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Días de Gracia
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={graceDays}
                    onChange={(e) => setGraceDays(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800"
                  />
                </div>

                <div className="col-span-2 sm:col-span-3">
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Horario y Canal de Soporte Técnico Incluido
                  </label>
                  <input
                    type="text"
                    value={supportHours}
                    onChange={(e) => setSupportHours(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* 4. Special / Custom Clauses */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wide text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>4. Cláusula Adicional / Acuerdos Especiales</span>
                </span>
                {customClauses && (
                  <button
                    type="button"
                    onClick={() => setCustomClauses('')}
                    className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                  >
                    Limpiar
                  </button>
                )}
              </div>

              <textarea
                rows={3}
                value={customClauses}
                onChange={(e) => setCustomClauses(e.target.value)}
                placeholder="Opcional: Escribe cualquier acuerdo especial con este cliente (ej. descuento por pronto pago, capacitación presencial, migración de productos...)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Insertar acuerdo rápido con 1 clic:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_CUSTOM_CLAUSES.map((clauseText, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() =>
                        setCustomClauses((prev) =>
                          prev.trim() ? `${prev.trim()}\n• ${clauseText}` : `• ${clauseText}`
                        )
                      }
                      className="text-left px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      + {clauseText.slice(0, 52)}...
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: LIVE FORMAL CONTRACT DOCUMENT PREVIEW (7 cols on desktop) */}
          <div
            className={`lg:col-span-7 overflow-y-auto p-3 sm:p-6 bg-slate-200/80 flex flex-col items-center ${
              mobileTab === 'editor' ? 'hidden lg:flex' : 'flex'
            }`}
          >
            {/* Paper Sheet Container */}
            <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-slate-300 p-6 sm:p-10 text-slate-900 space-y-5">
              {/* Top Document Header */}
              <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                    DOCUMENTO LEGAL DE LICENCIA Y SUSCRIPCIÓN TECNOLÓGICA (SAAS)
                  </div>
                  <h1 className="text-base sm:text-lg font-black text-slate-950 uppercase mt-1 leading-snug">
                    CONTRATO DE PRESTACIÓN DE SERVICIOS Y LICENCIA DE USO DE SOFTWARE EN LA NUBE
                  </h1>
                  <div className="text-xs text-slate-600 font-semibold mt-1">
                    {providerBrand} • {cityAndCountry}, {formattedIssueDateLong}
                  </div>
                </div>

                <div className="sm:text-right shrink-0">
                  <div className="inline-block font-mono font-black text-xs bg-slate-900 text-white px-3 py-1 rounded-lg">
                    {contractNumber}
                  </div>
                  <div className="text-[10px] font-extrabold uppercase text-emerald-700 mt-1">
                    {contractStatus === 'signed'
                      ? '✓ CONTRATO FIRMADO Y VIGENTE'
                      : contractStatus === 'sent'
                      ? 'ENVIADO PARA ACEPTACIÓN'
                      : 'VISTA PREVIA OFICIAL'}
                  </div>
                </div>
              </div>

              {/* Intro / Comparecen */}
              <p className="text-xs sm:text-[13px] leading-relaxed text-justify text-slate-800 font-serif">
                Nosotros, por una parte: <strong className="text-slate-950">{providerName.toUpperCase()}</strong>
                {providerIdentityOrRtn && (
                  <>
                    , con documento de Identidad / RTN N°{' '}
                    <strong className="text-slate-950">{providerIdentityOrRtn}</strong>
                  </>
                )}
                {providerPhone && (
                  <>
                    , teléfono <strong className="text-slate-950">{providerPhone}</strong>
                  </>
                )}
                {providerEmail && (
                  <>
                    {' '}
                    y correo electrónico <strong className="text-slate-950">{providerEmail}</strong>
                  </>
                )}
                , actuando en calidad de propietario y proveedor tecnológico de la plataforma{' '}
                <strong className="text-slate-950">&ldquo;{providerBrand}&rdquo;</strong>, quien en
                adelante se denominará <strong className="text-slate-950">&ldquo;EL PROVEEDOR&rdquo;</strong>; y
                por la otra parte:{' '}
                <strong className="text-slate-950">
                  {(clientRepresentative || selectedCompany.ownerName || 'EL REPRESENTANTE').toUpperCase()}
                </strong>
                {clientIdentityOrRtn && (
                  <>
                    , con documento de Identidad / RTN N°{' '}
                    <strong className="text-slate-950">{clientIdentityOrRtn}</strong>
                  </>
                )}
                , actuando en su condición de propietario/representante del establecimiento comercial
                denominado{' '}
                <strong className="text-slate-950">
                  &ldquo;{(clientBusinessName || selectedCompany.name).toUpperCase()}&rdquo;
                </strong>{' '}
                (Código de Sistema: <strong className="font-mono">{selectedCompany.slug}</strong>),
                ubicado en <strong className="text-slate-950">{clientAddress || 'Honduras'}</strong>
                {clientPhone && (
                  <>
                    {' '}
                    y teléfono <strong className="text-slate-950">{clientPhone}</strong>
                  </>
                )}
                , quien en adelante se denominará{' '}
                <strong className="text-slate-950">&ldquo;EL CLIENTE&rdquo;</strong>; hemos convenido en celebrar
                el presente{' '}
                <strong className="text-slate-950">
                  CONTRATO DE LICENCIA DE USO Y SUSCRIPCIÓN DE SOFTWARE (SAAS)
                </strong>
                , sujeto a las condiciones y cláusulas siguientes:
              </p>

              {/* Technical & Economic Summary Table */}
              <div className="rounded-xl border border-slate-300 overflow-hidden text-xs">
                <div className="bg-slate-900 text-white px-3.5 py-2 font-black text-[11px] uppercase tracking-wider flex items-center justify-between">
                  <span>Resumen Técnico y Económico de la Suscripción</span>
                  <span className="text-emerald-300 font-mono">Código: {selectedCompany.slug}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 bg-slate-50">
                  <div className="p-3 space-y-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 font-semibold">Negocio Cliente:</span>
                      <span className="font-black text-slate-900 text-right">
                        {clientBusinessName || selectedCompany.name}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 font-semibold">Modalidad:</span>
                      <span className="font-black text-emerald-700 text-right">
                        {planPeriodLabel}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 font-semibold">Cuota Acordada:</span>
                      <span className="font-black text-slate-900 text-right">
                        {formatCurrencyL(numericPrice)}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 space-y-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 font-semibold">Próximo Corte:</span>
                      <span className="font-bold text-slate-900 text-right">
                        {billingDayOrDate ? formatShortDateEs(billingDayOrDate) : 'Ciclo Mensual'} (
                        {numericGraceDays}d gracia)
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 font-semibold">Capacidad Plan:</span>
                      <span className="font-bold text-slate-900 text-right">
                        {selectedCompany.maxProducts && selectedCompany.maxProducts > 0
                          ? `${selectedCompany.maxProducts} prod.`
                          : 'Prod. Ilimitados'}{' '}
                        •{' '}
                        {selectedCompany.maxUsers && selectedCompany.maxUsers > 0
                          ? `${selectedCompany.maxUsers} usuarios`
                          : 'Usuarios Ilimitados'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 font-semibold">Activación Inicial:</span>
                      <span className="font-bold text-slate-900 text-right">
                        {numericSetupFee > 0
                          ? formatCurrencyL(numericSetupFee)
                          : 'L. 0.00 (Sin cargo)'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 10 Legal Clauses */}
              <div className="space-y-3.5">
                {legalClauses.map((clause, index) => (
                  <div key={index} className="text-xs sm:text-[12.5px] leading-relaxed text-justify">
                    <div className="font-black text-slate-950 uppercase text-[11px] tracking-wide mb-0.5">
                      {clause.title}
                    </div>
                    <p className="text-slate-700 font-serif">{clause.body}</p>
                  </div>
                ))}

                {customClauses.trim() && (
                  <div className="p-3.5 rounded-xl bg-emerald-50/70 border-l-4 border-emerald-600 text-xs sm:text-[12.5px] leading-relaxed text-justify">
                    <div className="font-black text-emerald-950 uppercase text-[11px] tracking-wide mb-1">
                      CLÁUSULA ADICIONAL: ACUERDOS ESPECIALES Y CONDICIONES PARTICULARES
                    </div>
                    <p className="text-slate-800 font-serif whitespace-pre-line">
                      {customClauses.trim()}
                    </p>
                  </div>
                )}
              </div>

              {/* Acceptance Footer */}
              <p className="text-xs sm:text-[12.5px] italic text-slate-700 text-justify pt-2 border-t border-slate-200 font-serif">
                En fe de lo cual, ambas partes declaran haber leído, comprendido y aceptado todas y
                cada una de las cláusulas contenidas en este documento, firmando de conformidad en
                la ciudad de <strong>{cityAndCountry}</strong>, a los{' '}
                <strong>{formattedIssueDateLong}</strong>.
              </p>

              {/* Dual Signature Boxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-10 pb-2">
                <div className="text-center">
                  <div className="border-b-2 border-slate-800 h-10 mb-2" />
                  <div className="font-black text-xs text-slate-950 uppercase">{providerName}</div>
                  <div className="text-[10px] font-extrabold text-emerald-700 uppercase">
                    EL PROVEEDOR / LICENCIANTE SAAS
                  </div>
                  {providerIdentityOrRtn && (
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      ID / RTN: {providerIdentityOrRtn}
                    </div>
                  )}
                  <div className="text-[10px] text-slate-500">{providerBrand}</div>
                </div>

                <div className="text-center">
                  <div className="border-b-2 border-slate-800 h-10 mb-2" />
                  <div className="font-black text-xs text-slate-950 uppercase">
                    {clientRepresentative || selectedCompany.ownerName || 'REPRESENTANTE LEGAL'}
                  </div>
                  <div className="text-[10px] font-extrabold text-slate-900 uppercase">
                    EL CLIENTE / SUSCRIPTOR ({clientBusinessName || selectedCompany.name})
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    {clientIdentityOrRtn
                      ? `ID / RTN: ${clientIdentityOrRtn}`
                      : 'ID / RTN: ___________________________'}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Código de Empresa: {selectedCompany.slug}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
