import React, { useState } from "react";
import { supabase } from "./lib/supabaseClient";

export default function Auth() {
  const [mode, setMode] = useState("login"); // "login" | "signup"
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
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Conta criada! Se a confirmação por e-mail estiver ativa no seu projeto Supabase, confira sua caixa de entrada antes de entrar.");
      }
    } catch (err) {
      setMessage(err.message || "Algo deu errado.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="authScreen">
      <form className="authCard" onSubmit={submit}>
        <div className="authBrand">
          <div className="brandIcon"><img src="/icons/icon-192.png" alt="Libano" /></div>
          <div>
            <b>Libano</b>
            <small>Finance + vida</small>
          </div>
        </div>
        <h1>{mode === "login" ? "Entrar" : "Criar conta"}</h1>
        <p className="authSub">
          {mode === "login"
            ? "Entre para sincronizar seus dados entre celular e PC."
            : "Crie uma conta gratuita para começar a sincronizar."}
        </p>
        <label>
          E-mail
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
        </label>
        <label>
          Senha
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 6 caracteres" />
        </label>
        {message && <div className="authMessage">{message}</div>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Um momento..." : mode === "login" ? "Entrar" : "Criar conta"}
        </button>
        <button
          type="button"
          className="authSwitch"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setMessage(null);
          }}
        >
          {mode === "login" ? "Não tem conta? Criar uma" : "Já tem conta? Entrar"}
        </button>
      </form>
    </div>
  );
}
