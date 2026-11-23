import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { Product } from "../lib/types";

export function useLiveProducts(category: "kunafa" | "baklava" | "gelato") {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLive = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("category", category)
        .in("status", ["active", "sold_out"])
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.warn("Could not load live products from Supabase, using defaults", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLive();

    // Listen to real-time changes on products table
    const channel = supabase
      .channel(`products-${category}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => {
          fetchLive();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [category]);

  return { products, isLoading, refetch: fetchLive };
}
