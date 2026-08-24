import React, { useState } from "react";
import { supabase } from "./lib/supabaseClient";

function AuthBrand() {
  return (
    <div className="authBrand">
      <div className="brandIcon"><img src="/icons/icon-192.png" alt="Libano" /></div>
      <div>
        <b>Libano</b>
        <small>Finance + vida</small>
      </div>
    </div>
  );
}

export default function Auth() {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Conta criada! Se a confirmação por e-mail estiver ativa no seu projeto Supabase, confira sua caixa de entrada antes de entrar.");
      } else {
        // "forgot": envia o e-mail de redefinição. O link volta pro próprio
        // app (redirectTo = origem atual) já autenticado num modo especial
        // ("PASSWORD_RECOVERY"), que o Root() detecta e mostra a tela de
        // nova senha (ver ResetPassword mais abaixo e useSession em main.jsx).
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setMessage("Se esse e-mail tiver uma conta, enviamos um link para redefinir a senha. Confira sua caixa de entrada (e o spam).");
      }
    } catch (err) {
      setMessage(err.message || "Algo deu errado.");
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Redefinir senha";
  const subtitle =
    mode === "login"
      ? "Entre para sincronizar seus dados entre celular e PC."
      : mode === "signup"
      ? "Crie uma conta gratuita para começar a sincronizar."
      : "Informe seu e-mail e enviaremos um link para você criar uma nova senha.";

  return (
    <div className="authScreen">
      <form className="authCard" onSubmit={submit}>
        <AuthBrand />
        <h1>{title}</h1>
        <p className="authSub">{subtitle}</p>
        <label>
          E-mail
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
        </label>
        {mode !== "forgot" && (
          <label>
            Senha
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 6 caracteres" />
          </label>
        )}
        {message && <div className="authMessage">{message}</div>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Um momento..." : mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
        </button>

        {mode === "login" && (
          <button
            type="button"
            className="authSwitch"
            onClick={() => {
              setMode("forgot");
              setMessage(null);
            }}
          >
            Esqueci minha senha
          </button>
        )}

        <button
          type="button"
          className="authSwitch"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setMessage(null);
          }}
        >
          {mode === "login"
            ? "Não tem conta? Criar uma"
            : mode === "signup"
            ? "Já tem conta? Entrar"
            : "Voltar para o login"}
        </button>
      </form>
    </div>
  );
}

// Tela mostrada quando o usuário clica no link de redefinição de senha do
// e-mail. O Supabase já autentica essa sessão automaticamente (evento
// "PASSWORD_RECOVERY"); aqui só pedimos a nova senha e chamamos updateUser.
export function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (password !== confirm) {
      setMessage("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setMessage("Senha atualizada! Você já pode continuar usando o app normalmente.");
    } catch (err) {
      setMessage(err.message || "Algo deu errado.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="authScreen">
      <form className="authCard" onSubmit={submit}>
        <AuthBrand />
        <h1>Criar nova senha</h1>
        <p className="authSub">Escolha uma nova senha para sua conta.</p>
        {!done && (
          <>
            <label>
              Nova senha
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 6 caracteres" />
            </label>
            <label>
              Confirmar nova senha
              <input type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="repita a senha" />
            </label>
          </>
        )}
        {message && <div className="authMessage">{message}</div>}
        {!done ? (
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Um momento..." : "Salvar nova senha"}
          </button>
        ) : (
          <button
            className="primary"
            type="button"
            onClick={() => {
              window.location.href = window.location.origin;
            }}
          >
            Ir para o app
          </button>
        )}
      </form>
    </div>
  );
}
