'use client';

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Save, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AddClinicPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    return (
        <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => router.back()}>
                    <Undo2 className="w-4 h-4 mr-2" /> Back
                </Button>
                <h1 className="text-3xl font-bold text-primary">Register New Clinic</h1>
            </div>

            <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
                <CardHeader className="bg-primary/5 border-b border-primary/10">
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Building2 className="w-6 h-6 text-primary" /> Clinic Information
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="name">Clinic Name</Label>
                            <Input id="name" placeholder="City Central Orthodontics" className="rounded-xl" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="code">Clinic Unique Code</Label>
                            <Input id="code" placeholder="CCO-001" className="rounded-xl" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="address">Full Address</Label>
                        <Input id="address" placeholder="123 Dental Lane, Suite 100" className="rounded-xl" />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="contact">Primary Contact Name</Label>
                            <Input id="contact" placeholder="Dr. Sarah Smith" className="rounded-xl" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Admin Email</Label>
                            <Input id="email" type="email" placeholder="admin@clinic.com" className="rounded-xl" />
                        </div>
                    </div>

                    <div className="pt-6 flex justify-end">
                        <Button className="bg-primary px-8 rounded-xl font-bold py-6 text-lg shadow-lg shadow-primary/20">
                            <Save className="w-5 h-5 mr-2" /> Initialize Clinic
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
