// CPF, telefone e datas de clientes. O banco guarda só os dígitos; a tela mostra formatado.

export const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '');

export function formatCPF(v) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

// Para o cupom: mostra só o miolo (***.456.789-**), protegendo o dado da cliente
export function maskCPF(v) {
  const d = onlyDigits(v);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '';
}

// Valida os dois dígitos verificadores do CPF
export function isValidCPF(v) {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

export function formatPhone(v) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const whatsappLink = (phone) => {
  const d = onlyDigits(phone);
  return d.length >= 10 ? `https://wa.me/55${d}` : '';
};

export const isValidEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// birthDate no formato "AAAA-MM-DD"
export function birthdayInfo(birthDate, today = new Date()) {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return {
    label: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
    age,
    thisMonth: today.getMonth() + 1 === m,
    today: today.getMonth() + 1 === m && today.getDate() === d,
  };
}

// Aplica máscara enquanto a pessoa digita
export function bindMask(input, formatter) {
  input.addEventListener('input', () => {
    const atEnd = input.selectionStart === input.value.length;
    input.value = formatter(input.value);
    if (atEnd) input.setSelectionRange(input.value.length, input.value.length);
  });
}
