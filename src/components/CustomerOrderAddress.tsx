import React, { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth, fetchCustomerAddresses, saveCustomerAddress, fetchCustomerProfile } from "../lib/auth";
import { CustomerAddress, CustomerProfile } from "../lib/types";
import { MapPin, Plus, Check, Home, Briefcase, Heart, Truck, Store } from "lucide-react";
import { toast } from "sonner";

export type OrderCustomerData = {
  customerId: string | null;
  name: string;
  phone: string;
  email: string | null;
  deliveryType: "delivery" | "pickup";
  addressSnapshot: Partial<CustomerAddress> | null;
};

type Props = {
  onDataChange: (data: OrderCustomerData) => void;
};

const LABEL_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  Home,
  Office: Briefcase,
  "Friend's Home": Heart,
};

export function CustomerOrderAddress({ onDataChange }: Props) {
  const { user, isLoading } = useAuth();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">("delivery");

  // Guest inputs (when not logged in)
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestLabel, setGuestLabel] = useState("Home");
  const [guestFlat, setGuestFlat] = useState("");
  const [guestBuilding, setGuestBuilding] = useState("");
  const [guestStreet, setGuestStreet] = useState("");
  const [guestArea, setGuestArea] = useState("");
  const [guestPincode, setGuestPincode] = useState("");
  const [guestInstructions, setGuestInstructions] = useState("");

  // New address form for logged in user
  const [showAddNew, setShowAddNew] = useState(false);
  const [newLabel, setNewLabel] = useState("Home");
  const [newFlat, setNewFlat] = useState("");
  const [newBuilding, setNewBuilding] = useState("");
  const [newStreet, setNewStreet] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newPincode, setNewPincode] = useState("");
  const [newAltPhone, setNewAltPhone] = useState("");
  const [newInstructions, setNewInstructions] = useState("");

  useEffect(() => {
    if (user) {
      fetchCustomerProfile(user.id).then((p) => setProfile(p));
      fetchCustomerAddresses(user.id).then((addrs) => {
        setAddresses(addrs);
        const def = addrs.find((a) => a.is_default) || addrs[0];
        if (def) setSelectedAddressId(def.id);
      });
    }
  }, [user]);

  // Sync data upward
  useEffect(() => {
    if (user) {
      const chosenAddr = addresses.find((a) => a.id === selectedAddressId) || null;
      onDataChange({
        customerId: user.id,
        name: profile?.name || user.user_metadata?.name || "Mithara Customer",
        phone: chosenAddr?.phone || profile?.phone || user.user_metadata?.phone || "",
        email: user.email || null,
        deliveryType,
        addressSnapshot: deliveryType === "pickup" ? null : chosenAddr,
      });
    } else {
      const snapshot: Partial<CustomerAddress> = {
        label: guestLabel,
        flat: guestFlat,
        building: guestBuilding,
        street: guestStreet,
        area: guestArea,
        pincode: guestPincode,
        instructions: guestInstructions,
      };
      onDataChange({
        customerId: null,
        name: guestName,
        phone: guestPhone,
        email: null,
        deliveryType,
        addressSnapshot: deliveryType === "pickup" ? null : snapshot,
      });
    }
  }, [
    user,
    profile,
    addresses,
    selectedAddressId,
    deliveryType,
    guestName,
    guestPhone,
    guestLabel,
    guestFlat,
    guestBuilding,
    guestStreet,
    guestArea,
    guestPincode,
    guestInstructions,
  ]);

  const handleSaveNewAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newFlat || !newStreet || !newArea) {
      toast.error("Please fill in flat, street, and area.");
      return;
    }

    try {
      const saved = await saveCustomerAddress({
        customer_id: user.id,
        label: newLabel,
        recipient_name: profile?.name || null,
        phone: newAltPhone || profile?.phone || null,
        flat: newFlat,
        building: newBuilding,
        street: newStreet,
        area: newArea,
        city: "Mumbai",
        pincode: newPincode,
        instructions: newInstructions,
        is_default: addresses.length === 0,
      });

      const updated = await fetchCustomerAddresses(user.id);
      setAddresses(updated);
      setSelectedAddressId(saved.id);
      setShowAddNew(false);
      setNewFlat("");
      setNewBuilding("");
      setNewStreet("");
      setNewArea("");
      setNewPincode("");
      setNewInstructions("");
      setNewAltPhone("");
      toast.success(`Saved "${newLabel}" address!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to save address");
    }
  };

  const field =
    "w-full rounded-xl border border-border bg-black/20 px-3.5 py-3 text-base text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:text-sm";

  return (
    <div className="space-y-4 pt-2">
      {/* Delivery vs Pickup Selector */}
      <div role="radiogroup" aria-label="Delivery or pickup" className="grid grid-cols-2 gap-2">
        {(
          [
            { id: "delivery", label: "Delivery", hint: "To your doorstep", Icon: Truck },
            { id: "pickup", label: "Self pickup", hint: "From our kitchen", Icon: Store },
          ] as const
        ).map(({ id, label, hint, Icon }) => {
          const active = deliveryType === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setDeliveryType(id)}
              className={`flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                active
                  ? "border-accent bg-accent/10 shadow-soft"
                  : "border-border bg-card/60 hover:border-accent/50"
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  active ? "bg-accent text-gold-foreground" : "bg-black/25 text-accent"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">{label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {user ? (
        /* Logged in state */
        deliveryType === "pickup" ? (
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-card/60 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/25 text-accent">
              <Store className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="text-sm">
              <p className="font-semibold text-foreground">Pick up from Mithara Kitchen</p>
              <p className="mt-0.5 leading-relaxed text-muted-foreground">
                No delivery fee. We'll message you as soon as your order is ready to collect.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                Delivery address
              </span>
              <button
                type="button"
                onClick={() => setShowAddNew(!showAddNew)}
                className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-xs font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{showAddNew ? "Cancel" : "Add new address"}</span>
              </button>
            </div>

            {/* Saved addresses selector */}
            {!showAddNew && addresses.length > 0 && (
              <div role="radiogroup" aria-label="Saved delivery addresses" className="space-y-2.5">
                {addresses.map((addr) => {
                  const isSelected = selectedAddressId === addr.id;
                  const LabelIcon = LABEL_ICON[addr.label] ?? MapPin;
                  return (
                    <button
                      key={addr.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedAddressId(addr.id)}
                      className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        isSelected
                          ? "border-accent bg-accent/10 shadow-soft"
                          : "border-border bg-card/60 hover:border-accent/50"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          isSelected ? "bg-accent text-gold-foreground" : "bg-black/25 text-accent"
                        }`}
                      >
                        <LabelIcon className="h-[18px] w-[18px]" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="flex items-center gap-2 font-semibold text-foreground">
                          {addr.label}
                          {addr.is_default && (
                            <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Default
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground line-clamp-2">
                          {[addr.flat, addr.building, addr.street, addr.area, addr.pincode]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                        {addr.phone && (
                          <span className="mt-1 block text-xs text-muted-foreground/80">
                            Recipient phone: {addr.phone}
                          </span>
                        )}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          isSelected ? "border-accent bg-accent text-gold-foreground" : "border-border"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {!showAddNew && addresses.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center">
                <MapPin className="mx-auto h-5 w-5 text-accent" aria-hidden="true" />
                <p className="mt-2 text-sm text-muted-foreground">
                  You haven't saved an address yet. Add one to continue.
                </p>
              </div>
            )}

            {/* Form to add a new address */}
            {showAddNew && (
              <form
                onSubmit={handleSaveNewAddress}
                className="space-y-3 rounded-2xl border border-accent/30 bg-card/60 p-4"
              >
                <span className="block text-sm font-semibold text-foreground">New delivery location</span>

                <div>
                  <span className="mb-1.5 block text-xs text-muted-foreground">Save as</span>
                  <div className="flex flex-wrap gap-2">
                    {["Home", "Office", "Friend's Home", "Other"].map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setNewLabel(l)}
                        aria-pressed={newLabel === l}
                        className={`min-h-9 rounded-full border px-3.5 text-xs transition-colors ${
                          newLabel === l
                            ? "border-accent bg-accent/20 font-semibold text-accent"
                            : "border-border text-muted-foreground hover:border-accent/50"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  type="text"
                  value={newFlat}
                  onChange={(e) => setNewFlat(e.target.value)}
                  required
                  autoComplete="address-line1"
                  aria-label="Flat, floor or unit number"
                  placeholder="Flat / Floor / Unit #"
                  className={field}
                />

                <input
                  type="text"
                  value={newStreet}
                  onChange={(e) => setNewStreet(e.target.value)}
                  required
                  autoComplete="address-line2"
                  aria-label="Street, building or landmark"
                  placeholder="Street / Building / Landmark"
                  className={field}
                />

                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={newArea}
                    onChange={(e) => setNewArea(e.target.value)}
                    required
                    aria-label="Area or locality"
                    placeholder="Area / Locality"
                    className={field}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newPincode}
                    onChange={(e) => setNewPincode(e.target.value)}
                    autoComplete="postal-code"
                    aria-label="Pincode"
                    placeholder="Pincode"
                    className={field}
                  />
                </div>

                <input
                  type="tel"
                  value={newAltPhone}
                  onChange={(e) => setNewAltPhone(e.target.value)}
                  aria-label="Alternate phone for this address"
                  placeholder="Alternate phone (optional)"
                  className={field}
                />

                <input
                  type="text"
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                  aria-label="Delivery instructions"
                  placeholder="Delivery instructions (e.g. ring bell, 3rd floor)"
                  className={field}
                />

                <button
                  type="submit"
                  className="min-h-11 w-full rounded-full bg-gradient-gold py-2.5 text-sm font-semibold text-gold-foreground shadow-soft transition-transform hover:scale-[1.01]"
                >
                  Save & select address
                </button>
              </form>
            )}
          </div>
        )
      ) : (
        /* Guest mode with Quick Address Form & Sign In Link */
        <div className="rounded-2xl border border-border bg-black/10 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div>
              <span className="text-xs font-semibold text-foreground">Customer Details</span>
              <p className="text-[10px] text-muted-foreground">
                Your one-time details for order fulfillment
              </p>
            </div>
            <Link
              to="/account/login"
              className="text-[11px] text-accent underline hover:opacity-80"
            >
              Sign In to Profile
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] text-muted-foreground mb-0.5">
                Your Full Name *
              </label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                className={field}
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted-foreground mb-0.5">
                WhatsApp Phone *
              </label>
              <input
                type="text"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className={field}
              />
            </div>
          </div>

          {deliveryType === "delivery" && (
            <div className="space-y-2 pt-2 border-t border-border/60">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                  Delivery Address
                </span>
                <div className="flex gap-1">
                  {["Home", "Office", "Friend's Home"].map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setGuestLabel(l)}
                      className={`rounded px-1.5 py-0.5 text-[9px] border ${
                        guestLabel === l
                          ? "bg-accent/20 border-accent text-accent font-bold"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <input
                type="text"
                value={guestFlat}
                onChange={(e) => setGuestFlat(e.target.value)}
                placeholder="Flat / Building / House name"
                className={field}
              />

              <input
                type="text"
                value={guestStreet}
                onChange={(e) => setGuestStreet(e.target.value)}
                placeholder="Street / Landmark"
                className={field}
              />

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={guestArea}
                  onChange={(e) => setGuestArea(e.target.value)}
                  placeholder="Area / Locality"
                  className={field}
                />
                <input
                  type="text"
                  value={guestPincode}
                  onChange={(e) => setGuestPincode(e.target.value)}
                  placeholder="Pincode"
                  className={field}
                />
              </div>

              <input
                type="text"
                value={guestInstructions}
                onChange={(e) => setGuestInstructions(e.target.value)}
                placeholder="Special delivery instructions (optional)"
                className={field}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
